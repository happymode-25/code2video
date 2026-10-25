import { NextResponse } from "next/server";
import { proseToScenes, parseScript, settingsFromDoc, toScriptYaml } from "@/lib/engine/script";
import { listProjects, newProject, saveProject, starterScene } from "@/lib/engine/store";
import { templateById } from "@/lib/templates";
import type { Project } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

/**
 * Create a project from a template, from prose, from a YAML document, or empty.
 * Templates are serialised to YAML and run back through the parser so a broken
 * template fails here with a useful message instead of at render time.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    template?: string;
    prose?: string;
    yaml?: string;
  };

  const name = (body.name || "").trim();
  let project: Project | null = null;

  let yamlSource = body.yaml?.trim() ?? "";
  if (!yamlSource && body.template) {
    const template = templateById(body.template);
    if (template.project) yamlSource = toScriptYaml(template.project);
  }

  if (yamlSource) {
    const parsed = parseScript(yamlSource);
    if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
    project = {
      ...newProject(parsed.doc.name || name || "Untitled video", parsed.scenes),
      ...settingsFromDoc(parsed.doc),
    };
    project.name = name || parsed.doc.name || project.name;
  } else if (body.prose?.trim()) {
    const scenes = proseToScenes(body.prose);
    project = newProject(name || "Untitled video", scenes.length ? scenes : [starterScene(body.prose)]);
  } else {
    project = newProject(name || "Untitled video", [
      starterScene(
        "Every good video starts with one clear sentence. Replace this text with your script and press Narrate.",
      ),
    ]);
  }

  const saved = saveProject(project);
  return NextResponse.json({ project: saved, yaml: toScriptYaml(saved) }, { status: 201 });
}
