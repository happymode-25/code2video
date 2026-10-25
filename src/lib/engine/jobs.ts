import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";
import type { Job, JobKind } from "./types";

/**
 * On-disk job records so progress survives a dev-server restart, plus a
 * one-at-a-time queue for renders (this machine has 8 cores; two concurrent
 * Remotion renders would just fight each other).
 */

const MAX_LOG_LINES = 400;
const MAX_JOBS = 80;

type Store = Map<string, Job>;

const globalForJobs = globalThis as unknown as { __c2vJobs?: Store };
const jobs: Store = globalForJobs.__c2vJobs ?? new Map<string, Job>();
globalForJobs.__c2vJobs = jobs;

/** Renders are serialised through this chain. */
let queueTail: Promise<unknown> = Promise.resolve();

if (jobs.size === 0) hydrate();

function hydrate(): void {
  try {
    fs.mkdirSync(paths.jobsDir, { recursive: true });
    for (const file of fs.readdirSync(paths.jobsDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const job = JSON.parse(fs.readFileSync(path.join(paths.jobsDir, file), "utf-8")) as Job;
        // A job that was mid-flight when the process died is no longer running.
        if (job.state === "running") {
          job.state = "error";
          job.error = "interrupted (server restarted)";
          job.message = "interrupted";
        }
        jobs.set(job.id, job);
      } catch {
        /* ignore unreadable job files */
      }
    }
  } catch {
    /* nothing to hydrate */
  }
}

function jobFile(id: string): string {
  return path.join(paths.jobsDir, `${id}.json`);
}

function persist(job: Job): void {
  try {
    fs.mkdirSync(paths.jobsDir, { recursive: true });
    fs.writeFileSync(jobFile(job.id), JSON.stringify(job, null, 2), "utf-8");
  } catch {
    /* persistence is best-effort */
  }
}

function prune(): void {
  const list = [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const job of list.slice(MAX_JOBS)) {
    jobs.delete(job.id);
    try {
      fs.rmSync(jobFile(job.id), { force: true });
    } catch {
      /* ignore */
    }
  }
}

export function createJob(projectId: string, kind: JobKind): Job {
  const job: Job = {
    id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    projectId,
    kind,
    state: "queued",
    progress: 0,
    message: "queued",
    createdAt: new Date().toISOString(),
    log: [],
  };
  jobs.set(job.id, job);
  persist(job);
  prune();
  return job;
}

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null;
}

export function listJobs(limit = 30): Job[] {
  return [...jobs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function updateJob(id: string, patch: Partial<Job>): Job | null {
  const job = jobs.get(id);
  if (!job) return null;
  const next = { ...job, ...patch };
  jobs.set(id, next);
  persist(next);
  return next;
}

export function logJob(id: string, line: string): void {
  const job = jobs.get(id);
  if (!job) return;
  const text = line.replace(/\s+$/, "");
  if (!text) return;
  const log = [...job.log, text];
  const next = { ...job, log: log.slice(-MAX_LOG_LINES), message: text.slice(0, 200) };
  jobs.set(id, next);
  persist(next);
}

export function startJob(id: string): void {
  updateJob(id, { state: "running", startedAt: new Date().toISOString(), message: "starting" });
}

export function finishJob(id: string, output?: string): void {
  updateJob(id, {
    state: "done",
    progress: 1,
    finishedAt: new Date().toISOString(),
    message: "done",
    output,
  });
}

export function failJob(id: string, error: string): void {
  logJob(id, `ERROR: ${error}`);
  updateJob(id, {
    state: "error",
    error: error.slice(0, 500),
    finishedAt: new Date().toISOString(),
    message: "failed",
  });
}

/** Run `task` after every previously queued task has settled. */
export function runExclusive<T>(id: string, task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    logJob(id, "waiting for the render slot...");
    return task();
  };
  const result = queueTail.then(run, run);
  queueTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function queueDepth(): number {
  return [...jobs.values()].filter((j) => j.state === "queued" || j.state === "running").length;
}

export function activeJobFor(projectId: string, kind: JobKind): Job | null {
  return (
    [...jobs.values()]
      .filter((j) => j.projectId === projectId && j.kind === kind)
      .filter((j) => j.state === "queued" || j.state === "running")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}
