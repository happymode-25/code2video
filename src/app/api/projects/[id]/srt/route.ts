import { readNarration, getProject, writeSrt } from "@/lib/engine/store";
import { buildSrt, buildTimeline } from "@/lib/video/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download the subtitles for the project's current timings. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return new Response("project not found", { status: 404 });

  const narration = readNarration(id);
  const timeline = buildTimeline(
    { fps: project.fps, gap: project.gap, captions: project.captions, scenes: project.scenes },
    narration,
  );
  const srt = buildSrt(timeline.captions);
  writeSrt(id, srt);

  return new Response(srt, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${project.id}.srt"`,
      "cache-control": "no-store",
    },
  });
}
