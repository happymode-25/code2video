import { NextResponse } from "next/server";
import { invalidateBundle } from "@/lib/engine/render";
import { parseScript, settingsFromDoc, toScriptYaml } from "@/lib/engine/script";
import { deleteProject, getProject, readNarration, saveProject } from "@/lib/engine/store";
import type { Project } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });
  return NextResponse.json({
    project,
    narration: readNarration(id),
    yaml: toScriptYaml(project),
  });
}

/**
 * Save. The YAML document is the source of truth, so the editor posts YAML
 * back and the server re-derives scenes and settings from it.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = getProject(id);
  if (!current) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { yaml?: string; name?: string };
  let next: Project = current;

  if (typeof body.yaml === "string" && body.yaml.trim()) {
    const parsed = parseScript(body.yaml);
    if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
    next = {
      ...current,
      ...settingsFromDoc(parsed.doc),
      name: parsed.doc.name || current.name,
      scenes: parsed.scenes,
    };
  }
  if (typeof body.name === "string" && body.name.trim()) {
    next = { ...next, name: body.name.trim() };
  }

  const saved = saveProject(next);
  // Scene text or count may have changed; drop the cached Remotion bundle so
  // the next render picks up the new composition.
  invalidateBundle();
  return NextResponse.json({ project: saved, narration: readNarration(id), yaml: toScriptYaml(saved) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteProject(id);
  if (!ok) return NextResponse.json({ error: "project not found" }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
