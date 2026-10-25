import { NextResponse } from "next/server";
import { activeJobFor, createJob, failJob, finishJob, logJob, runExclusive, startJob } from "@/lib/engine/jobs";
import { criticalFailures } from "@/lib/engine/paths";
import { renderProject, type RenderMode } from "@/lib/engine/render";
import { parseScript, settingsFromDoc } from "@/lib/engine/script";
import { getProject, saveProject } from "@/lib/engine/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let project = getProject(id);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { yaml?: string; mode?: RenderMode };
  const mode: RenderMode = body.mode === "full" ? "full" : "draft";

  if (typeof body.yaml === "string" && body.yaml.trim()) {
    const parsed = parseScript(body.yaml);
    if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
    project = saveProject({ ...project, ...settingsFromDoc(parsed.doc), scenes: parsed.scenes });
  }

  const missing = criticalFailures("render");
  if (missing.length) {
    return NextResponse.json(
      { error: `cannot render: ${missing.map((c) => c.label).join(", ")}`, checks: missing },
      { status: 503 },
    );
  }
  if (!project.scenes.length) {
    return NextResponse.json({ error: "project has no scenes" }, { status: 400 });
  }

  const existing = activeJobFor(id, "render");
  if (existing) return NextResponse.json({ job: existing, alreadyRunning: true });

  const job = createJob(id, "render");
  logJob(job.id, `render requested (${mode})`);

  void runExclusive(job.id, async () => {
    startJob(job.id);
    try {
      const result = await renderProject(project, job, mode);
      finishJob(job.id, result.record.url);
    } catch (err) {
      failJob(job.id, errMessage(err));
    }
  });

  return NextResponse.json({ job }, { status: 202 });
}
