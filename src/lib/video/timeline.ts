import type {
  CaptionOptions,
  Narration,
  NarrationScene,
  SceneSpec,
} from "../engine/types";

/** The slice of a project the timeline needs. Keeps this usable from the browser. */
export type TimelineInput = {
  fps: number;
  gap: number;
  captions: CaptionOptions;
  scenes: SceneSpec[];
};

/**
 * Pure timing + caption maths. Used by the Remotion composition (browser and
 * server), by the SRT export and by the editor outline. No node imports here.
 */

export type CaptionChunk = { start: number; end: number; text: string };

export type SceneTiming = {
  scene: SceneSpec;
  nar: NarrationScene | null;
  index: number;
  /** seconds from the top of the video */
  start: number;
  duration: number;
  startFrame: number;
  durationFrames: number;
  /** true when these timings are guesses because narration has not run yet */
  estimated: boolean;
  /** Piper voice that should speak this scene. */
  voiceId: string;
};

export type Timeline = {
  scenes: SceneTiming[];
  durationInFrames: number;
  durationSeconds: number;
  captions: CaptionChunk[];
  hasNarration: boolean;
  estimated: boolean;
};

/** Extra tail after the last scene so the outro can land. */
export const TAIL_SECONDS = 0.7;
/** Silence between two scenes that have different speakers. */
export const SPEAKER_GAP_SECONDS = 0.22;
/** Assumed speaking rate (words/sec) when narration is missing. */
const ESTIMATED_WPS = 2.6;

export function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(30, Math.max(2, words / ESTIMATED_WPS + 0.4));
}

/** Split a scene's words into readable caption chunks. */
export function chunkWords(
  words: { word: string; start: number; end: number }[],
  opts: CaptionOptions,
): CaptionChunk[] {
  const maxWords = Math.max(1, Math.round(opts.maxWords));
  const maxSeconds = Math.max(0.5, opts.maxSeconds);
  const out: CaptionChunk[] = [];
  let bucket: typeof words = [];
  const flush = () => {
    if (!bucket.length) return;
    out.push({
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      text: bucket.map((w) => w.word).join(" "),
    });
    bucket = [];
  };
  for (const w of words) {
    bucket.push(w);
    const span = bucket[bucket.length - 1].end - bucket[0].start;
    if (bucket.length >= maxWords || span > maxSeconds) flush();
  }
  flush();
  return out;
}

/** Same, but for scenes with no word timings yet - fake even spacing. */
function estimateChunks(text: string, opts: CaptionOptions): CaptionChunk[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const step = 1 / ESTIMATED_WPS;
  const maxWords = Math.max(1, Math.round(opts.maxWords));
  const out: CaptionChunk[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const slice = words.slice(i, i + maxWords);
    out.push({ start: i * step, end: (i + slice.length) * step, text: slice.join(" ") });
  }
  return out;
}

/**
 * Keep only the narration that still matches the edited text. Scenes that were
 * rewritten fall back to estimated timings (and lose their audio) instead of
 * showing a voice track that no longer lines up with the words on screen.
 */
export function filterNarration(
  narration: Narration | null,
  scenes: SceneSpec[],
): { narration: Narration | null; matched: number; missing: number } {
  if (!narration) return { narration: null, matched: 0, missing: scenes.length };

  const byId = new Map(narration.scenes.map((s) => [s.id, s]));
  const kept: NarrationScene[] = [];
  let missing = 0;

  for (const scene of scenes) {
    const nar = byId.get(scene.id);
    const sameText =
      nar !== undefined &&
      nar.text.replace(/\s+/g, " ").trim() === scene.narration.replace(/\s+/g, " ").trim();
    // A changed voice invalidates the audio the same way changed words do.
    const sameVoice = nar !== undefined && (nar.voiceId ?? "") === (scene.voice ?? "");
    if (sameText && sameVoice && nar) kept.push(nar);
    else missing += 1;
  }

  if (!kept.length) return { narration: null, matched: 0, missing };
  return {
    narration: { ...narration, total: kept.reduce((n, s) => n + s.duration, 0), scenes: kept },
    matched: kept.length,
    missing,
  };
}

export function buildTimeline(input: TimelineInput, narration: Narration | null): Timeline {
  const fps = input.fps || 30;
  const baseGap = input.gap ?? 0.45;
  const byId = new Map<number, NarrationScene>();
  for (const s of narration?.scenes ?? []) byId.set(s.id, s);

  const scenes: SceneTiming[] = [];
  const captions: CaptionChunk[] = [];
  let acc = 0;
  let anyEstimated = false;
  let voice = "";

  input.scenes.forEach((scene, index) => {
    const nar = byId.get(scene.id) ?? null;
    const duration = nar ? nar.duration : estimateDuration(scene.narration);
    const estimated = !nar;
    if (estimated) anyEstimated = true;

    // Every scene needs a gap before it except the first. Two scenes with
    // different speakers get a little more air, like a cut to the other person.
    const voiceId = nar?.voiceId ?? scene.voice ?? voice ?? "";
    const sameSpeaker = index === 0 || voiceId === voice;
    const gapBefore = index === 0 ? 0 : sameSpeaker ? baseGap : Math.max(baseGap, SPEAKER_GAP_SECONDS);
    acc += gapBefore;
    voice = voiceId || voice;

    scenes.push({
      scene,
      nar,
      index,
      voiceId,
      start: acc,
      duration,
      startFrame: Math.round(acc * fps),
      durationFrames: Math.max(1, Math.round(duration * fps)),
      estimated,
    });

    const chunks = nar
      ? chunkWords(nar.words, input.captions)
      : estimateChunks(scene.narration, input.captions);
    const offset = acc;
    for (const c of chunks) {
      captions.push({ start: c.start + offset, end: c.end + offset, text: c.text });
    }

    acc += duration;
  });

  const totalSeconds = acc + TAIL_SECONDS;
  return {
    scenes,
    durationInFrames: Math.max(fps, Math.round(totalSeconds * fps)),
    durationSeconds: totalSeconds,
    captions,
    hasNarration: !anyEstimated,
    estimated: anyEstimated,
  };
}

/** H:MM:SS,mmm for SRT. */
export function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

export function buildSrt(chunks: CaptionChunk[]): string {
  return chunks
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}
