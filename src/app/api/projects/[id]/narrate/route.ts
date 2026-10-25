import { NextResponse } from "next/server";
import { failJob, activeJobFor, createJob, finishJob, logJob, runExclusive, startJob, updateJob } from "@/lib/engine/jobs";
import { runNarration } from "@/lib/engine/narrate";
import { criticalFailures } from "@/lib/engine/paths";
import { parseScript, settingsFromDoc } from "@/lib/engine/script";
import { getProject, readNarration, saveProject } from "@/lib/engine/store";
import { effectiveVoiceId } from "@/lib/engine/voices";
import { voiceStatus } from "@/lib/engine/voice-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let project = getProject(id);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { yaml?: string; force?: boolean };

  // Save first when the editor hands us the current YAML, so we always narrate
  // exactly what is on screen.
  if (typeof body.yaml === "string" && body.yaml.trim()) {
    const parsed = parseScript(body.yaml);
    if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
    project = saveProject({ ...project, ...settingsFromDoc(parsed.doc), scenes: parsed.scenes });
  }

  const missing = criticalFailures("narration");
  if (missing.length) {
    return NextResponse.json(
      { error: `engine not ready: ${missing.map((c) => c.label).join(", ")}`, checks: missing },
      { status: 503 },
    );
  }

  const scenes = project.scenes.filter((s) => s.narration.trim().length > 0);
  if (!scenes.length) {
    return NextResponse.json({ error: "no scenes have narration text yet" }, { status: 400 });
  }

  // Fail here, with the voices named, rather than 40 minutes into a render.
  const wanted = new Set(
    scenes.map((s) => effectiveVoiceId(s.voice, project.voice)).filter(Boolean),
  );
  const notInstalled = voiceStatus()
    .filter((v) => wanted.has(v.id) && !v.installed)
    .map((v) => v.label);
  if (notInstalled.length) {
    return NextResponse.json(
      {
        error: `these voices are not installed: ${notInstalled.join(", ")}. Run: npm run voices`,
        missing: notInstalled,
      },
      { status: 400 },
    );
  }

  const existing = activeJobFor(id, "narrate");
  if (existing) return NextResponse.json({ job: existing, alreadyRunning: true });

  const job = createJob(id, "narrate");
  logJob(job.id, `narration: ${scenes.length} scenes, force=${Boolean(body.force)}`);
  logJob(job.id, `voices: ${[...wanted].join(", ")}`);

  void runExclusive(job.id, async () => {
    startJob(job.id);
    try {
      const result = await runNarration(project, job, Boolean(body.force));
      logJob(
        job.id,
        `narration complete: ${result.total.toFixed(2)}s across ${result.scenes} scenes, ${result.words} word timings`,
      );
      updateJob(job.id, { progress: 1 });
      finishJob(job.id, readNarration(id) ? "narration.json" : undefined);
    } catch (err) {
      failJob(job.id, errMessage(err));
    }
  });

  return NextResponse.json({ job }, { status: 202 });
}
