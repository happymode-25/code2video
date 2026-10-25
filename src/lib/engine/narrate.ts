import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { logJob, updateJob } from "./jobs";
import { paths } from "./paths";
import { readNarration, projectDir } from "./store";
import { DEFAULT_VOICE_ID, effectiveVoiceId } from "./voices";
import { voicePath } from "./voice-files";
import type { Job, Project } from "./types";

/** Runs the Python narration engine and reports progress into the job record. */

export type NarrateResult = {
  total: number;
  scenes: number;
  words: number;
  voices: string[];
};

export function writeSpec(project: Project, force = false): string {
  const dir = projectDir(project.id);
  const fallback = voicePath(project.voice) ?? voicePath(DEFAULT_VOICE_ID);
  const spec = {
    fps: project.fps,
    outDir: dir.replace(/\\/g, "/"),
    voice: fallback,
    whisperDir: paths.whisperDir.replace(/\\/g, "/"),
    force,
    scenes: project.scenes
      .filter((s) => s.narration.trim().length > 0)
      .map((s) => {
        const voiceId = effectiveVoiceId(s.voice, project.voice);
        return {
          id: s.id,
          slug: s.slug,
          text: s.narration.trim(),
          // Absolute path here; the engine never needs to know about voice ids.
          voice: voicePath(voiceId) ?? fallback,
          voiceId,
        };
      }),
  };
  const file = path.join(dir, "spec.json");
  fs.writeFileSync(file, JSON.stringify(spec, null, 2), "utf-8");
  return file;
}

export async function runNarration(project: Project, job: Job, force = false): Promise<NarrateResult> {
  const scenes = project.scenes.filter((s) => s.narration.trim().length > 0);
  if (scenes.length === 0) throw new Error("no scenes with narration text");

  const specFile = writeSpec(project, force);
  logJob(job.id, `engine: ${scenes.length} scenes -> ${specFile}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(paths.python, [paths.narrateScript, specFile], {
      cwd: paths.projectRoot,
      windowsHide: true,
    });

    let stderr = "";
    let buffer = "";

    const handleLine = (line: string) => {
      const text = line.trim();
      if (!text) return;
      const progress = /^PROGRESS (\d+) (\d+)$/.exec(text);
      if (progress) {
        const done = Number(progress[1]);
        const total = Number(progress[2]);
        updateJob(job.id, {
          progress: total ? done / total : 0,
          message: `narration ${done}/${total}`,
        });
        return;
      }
      logJob(job.id, text);
    };

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    });

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (buffer.trim()) handleLine(buffer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `narrate.py exited with code ${code}`));
    });
  });

  const narration = readNarration(project.id);
  if (!narration) throw new Error("engine finished but narration.json is missing");

  const words = narration.scenes.reduce((n, s) => n + s.words.length, 0);
  const voices = narration.voices ?? [...new Set(narration.scenes.map((s) => s.voiceId ?? "default"))];
  return { total: narration.total, scenes: narration.scenes.length, words, voices };
}
