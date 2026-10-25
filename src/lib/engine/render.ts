import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { logJob, updateJob } from "./jobs";
import { paths } from "./paths";
import { addRender, outDir, projectDir, readNarration } from "./store";
import type { Job, Project, RenderRecord } from "./types";
import type { StudioProps } from "@/remotion/Studio";
import { buildSrt, buildTimeline, SPEAKER_GAP_SECONDS } from "@/lib/video/timeline";

/** Bundling Remotion is slow (~30-60s), so it is done once per server run. */
const globalForBundle = globalThis as unknown as { __c2vServeUrl?: Promise<string> };

/**
 * `bundle()` copies `public/` into the bundle output *once*, when the bundle is
 * built. The bundle is then cached for the life of the server, so any project
 * created or narrated afterwards would 404 on its own audio. Re-syncing the
 * public directory before each render is cheap (a few MB) and makes a cached
 * bundle always serve the current files.
 */
function syncPublicDir(serveUrl: string, log?: (line: string) => void): void {
  const source = paths.publicDir;
  if (!fs.existsSync(source) || /^https?:/i.test(serveUrl)) return;
  const target = path.join(serveUrl, "public");
  try {
    fs.mkdirSync(target, { recursive: true });
    let copied = 0;
    for (const entry of fs.readdirSync(source, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const from = path.join(entry.parentPath ?? entry.path, entry.name);
      const rel = path.relative(source, from);
      const to = path.join(target, rel);
      // Remotion's bundler may already have an identical copy; skip those.
      const size = fs.statSync(from).size;
      if (fs.existsSync(to) && fs.statSync(to).size === size) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      copied++;
    }
    log?.(copied ? `media: refreshed ${copied} file(s) into the bundle` : "media: bundle is up to date");
  } catch (err) {
    // A sync failure should not kill the render: the bundle may already hold
    // enough files, and the render will report the real problem if it does not.
    log?.(`media: could not refresh the bundle (${err instanceof Error ? err.message : String(err)})`);
  }
}

export function studioPropsFor(project: Project, log?: (line: string) => void): StudioProps {
  const narration = readNarration(project.id);
  if (!narration) log?.(`warning: ${project.id} has no narration.json - timings will be estimated`);
  const multiVoice = new Set(project.scenes.map((s) => s.voice ?? project.voice ?? "").filter(Boolean)).size > 1;
  if (multiVoice) log?.("multiple voices: scenes with different speakers get extra air between them");
  return {
    fps: project.fps,
    width: project.width,
    height: project.height,
    // The composition and the SRT must agree on the gap, so widen it here for a
    // conversational script and both paths pick the same number up.
    gap: multiVoice ? Math.max(project.gap, SPEAKER_GAP_SECONDS) : project.gap,
    theme: project.theme,
    captions: project.captions,
    scenes: project.scenes,
    narration,
    cast: project.cast,
  };
}

export async function getServeUrl(onProgress?: (p: number) => void): Promise<string> {
  if (globalForBundle.__c2vServeUrl) {
    onProgress?.(1);
    return globalForBundle.__c2vServeUrl;
  }
  const promise = bundle({
    entryPoint: paths.remotionEntry,
    publicDir: paths.publicDir,
    onProgress: (percent) => onProgress?.(Math.min(1, percent / 100)),
    // Quiet the noisy webpack output; Remotion prints its own summary.
    webpackOverride: (config) => ({ ...config, stats: "errors-warnings" }),
  });
  globalForBundle.__c2vServeUrl = promise;
  try {
    return await promise;
  } catch (err) {
    globalForBundle.__c2vServeUrl = undefined;
    throw err;
  }
}

export function invalidateBundle(): void {
  globalForBundle.__c2vServeUrl = undefined;
}

/**
 * The port Remotion's own bundle server would take by default. It collides with
 * `next dev`, and Remotion then verifies the *Next* page as a Remotion project
 * and fails with "not a valid Remotion project". Picking a port away from the
 * app avoids that.
 */
export const RENDER_SERVE_PORT = Number(process.env.C2V_RENDER_PORT ?? 3111);

export type RenderMode = "draft" | "full";

export type RenderResult = {
  record: RenderRecord;
  srtFile: string;
  durationSeconds: number;
  frames: number;
};

function probe(file: string): { durationSeconds: number } {
  try {
    const out = execFileSync(
      paths.ffprobe,
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { encoding: "utf-8", timeout: 30_000 },
    );
    return { durationSeconds: Number(out.trim()) || 0 };
  } catch {
    return { durationSeconds: 0 };
  }
}

export async function renderProject(project: Project, job: Job, mode: RenderMode): Promise<RenderResult> {
  const log = (line: string) => logJob(job.id, line);
  const props = studioPropsFor(project, log);

  if (props.scenes.length === 0) throw new Error("project has no scenes");

  updateJob(job.id, { progress: 0, message: "bundling" });
  log("bundling the composition (first run takes ~1 minute)...");
  const serveUrl = await getServeUrl((p) => updateJob(job.id, { progress: p * 0.15, message: "bundling" }));
  log("bundle ready");
  // The bundle is cached for the life of the server, so pull in any audio that
  // was written after it was built.
  syncPublicDir(serveUrl, log);

  const composition = await selectComposition({
    serveUrl,
    id: "Studio",
    inputProps: props,
    port: RENDER_SERVE_PORT,
  });
  const frames = composition.durationInFrames;
  log(`composition: ${composition.width}x${composition.height}, ${frames} frames`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `${project.id}-${mode}-${stamp}.mp4`;
  const outputLocation = path.join(outDir(project.id), fileName);

  // Subtitles come from the same timings the renderer used.
  const timeline = buildTimeline(
    { fps: props.fps, gap: props.gap, captions: props.captions, scenes: props.scenes },
    props.narration,
  );
  const srtFile = path.join(projectDir(project.id), "captions.srt");
  fs.writeFileSync(srtFile, buildSrt(timeline.captions), "utf-8");
  log(`subtitles: ${timeline.captions.length} cues -> captions.srt`);

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    audioCodec: "aac",
    outputLocation,
    inputProps: props,
    port: RENDER_SERVE_PORT,
    crf: mode === "full" ? 18 : 26,
    scale: mode === "draft" ? 0.5 : 1,
    concurrency: 6,
    // Remotion crossfades every Audio tag in the composition. A two-speaker
    // script wants that overlap; a single narrator wants clean cuts.
    audioBitrate: "192k",
    onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => {
      // 0.15 -> 1.0 keeps the bundling phase visible in the same number.
      updateJob(job.id, {
        progress: 0.15 + progress * 0.85,
        message: `${stitchStage === "encoding" ? "encoding" : "rendering"} ${renderedFrames}/${frames} (${encodedFrames} encoded)`,
      });
    },
  });

  const stat = fs.statSync(outputLocation);
  const { durationSeconds } = probe(outputLocation);
  const record: RenderRecord = {
    id: path.basename(fileName, ".mp4"),
    file: fileName,
    url: `/projects/${project.id}/out/${fileName}`,
    width: mode === "draft" ? Math.round(composition.width / 2) : composition.width,
    height: mode === "draft" ? Math.round(composition.height / 2) : composition.height,
    createdAt: new Date().toISOString(),
    bytes: stat.size,
    mode,
  };
  addRender(project.id, record);
  log(`done: ${fileName} (${(stat.size / 1024 / 1024).toFixed(1)} MB, ${durationSeconds.toFixed(2)}s)`);

  return { record, srtFile, durationSeconds, frames };
}
