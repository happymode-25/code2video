import { notFound } from "next/navigation";
import { StudioEditor } from "@/components/StudioEditor";
import { scenesToProse, toScriptYaml } from "@/lib/engine/script";
import { getProject, readNarration } from "@/lib/engine/store";
import { VOICES } from "@/lib/engine/voices";
import { voiceStatus } from "@/lib/engine/voice-files";
import type { Project } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let project: Project | null = null;
  try {
    project = getProject(id);
  } catch {
    project = null;
  }
  if (!project) notFound();

  // Voice ids plus whether each model is actually on disk, so the picker can
  // grey out what is not downloaded instead of failing at narration time.
  const installed = new Map(voiceStatus().map((s) => [s.id, s.installed]));
  const voices = VOICES.map((v) => ({
    id: v.id,
    label: v.label,
    lang: v.lang,
    gender: v.gender,
    blurb: v.blurb,
    best: v.best,
    color: v.color,
    installed: installed.get(v.id) ?? false,
  }));

  return (
    <StudioEditor
      projectId={project.id}
      initialName={project.name}
      initialYaml={toScriptYaml(project)}
      initialProse={scenesToProse(project.scenes)}
      narration={readNarration(project.id)}
      renders={project.renders}
      voices={voices}
    />
  );
}
