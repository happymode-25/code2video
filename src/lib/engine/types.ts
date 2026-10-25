/** Shared domain types for code2video. */

import type { CharacterLook } from "./cast";

/* ----------------------------------------------------------------- blocks */

export type Card = { label: string; value?: string; hint?: string };
export type StackLayer = { label: string; color?: string };
export type Side = { title: string; items: string[] };
export type TimelineEntry = { when: string; what: string; note?: string };
export type TableData = { columns: string[]; rows: string[][] };
export type DiagramNode = { id: string; label: string; color?: string; sub?: string };
export type DiagramEdge = { from: string; to: string; label?: string };

/** Which callout icon to draw. */
export type CalloutKind = "note" | "tip" | "warning" | "danger" | "key";

/** A scene is narration text plus one or more visual blocks. */
export type Block =
  | { type: "title"; text: string; sub?: string }
  | { type: "bullets"; heading?: string; items: string[] }
  | { type: "cards"; heading?: string; items: Card[] }
  | { type: "stack"; heading?: string; layers: StackLayer[]; highlight?: number }
  | { type: "steps"; heading?: string; items: string[] }
  | { type: "compare"; heading?: string; left: Side; right: Side }
  | { type: "code"; heading?: string; language?: string; code: string }
  | { type: "mnemonic"; phrase: string; expansion: string[] }
  | { type: "outro"; text: string; sub?: string }
  /* --- documentation + teaching blocks --- */
  | { type: "quote"; text: string; who?: string; source?: string }
  | { type: "callout"; kind?: CalloutKind; title?: string; text: string }
  | { type: "timeline"; heading?: string; entries: TimelineEntry[] }
  | { type: "table"; heading?: string; data: TableData; highlight?: number }
  | { type: "diagram"; heading?: string; nodes: DiagramNode[]; edges?: DiagramEdge[] }
  | { type: "chapter"; number?: string; title: string; sub?: string }
  | { type: "stat"; heading?: string; items: Card[]; note?: string }
  | { type: "keypoints"; heading?: string; items: string[] };

/** Discriminators in the order the editor help text lists them. */
export const BLOCK_TYPES: Block["type"][] = [
  "title",
  "bullets",
  "cards",
  "stack",
  "steps",
  "compare",
  "code",
  "mnemonic",
  "outro",
  "quote",
  "callout",
  "timeline",
  "table",
  "diagram",
  "chapter",
  "stat",
  "keypoints",
];

/** The blocks added for documentation/education videos. */
export const DOC_BLOCK_TYPES: Block["type"][] = [
  "quote",
  "callout",
  "timeline",
  "table",
  "diagram",
  "chapter",
  "stat",
  "keypoints",
];

export type SceneSpec = {
  id: number;
  slug: string;
  /** Short label shown in the corner chip and in the editor outline. */
  title: string;
  /** What the voice says. Every scene needs this. */
  narration: string;
  /** Per-scene accent; falls back to the theme accent. */
  accent?: string;
  /** Voice id ("lessac" | "amy" | "alan" | ...); falls back to the project voice. */
  voice?: string;
  /**
   * How the scene is staged.
   *  - "board"    blocks only (the default; what every existing script uses)
   *  - "character" one character on screen, blocks beside them
   *  - "dialogue" two characters facing each other, blocks above them
   */
  mode?: "board" | "character" | "dialogue";
  /** Who is speaking: a cast preset id ("teacher") or a declared character. */
  speaker?: string;
  /** Second speaker for `mode: dialogue`. */
  listener?: string;
  blocks: Block[];
};

/* ------------------------------------------------------------------ theme */

export type ThemeSpec = {
  name: string;
  bg: string;
  bg2: string;
  deep: string;
  ink: string;
  muted: string;
  dim: string;
  accent: string;
  good: string;
  warn: string;
  /** Cycled through when a block needs several colours (cards, stack, steps). */
  palette: string[];
  font: string;
  grid: boolean;
};

/* --------------------------------------------------------------- captions */

export type CaptionOptions = {
  enabled: boolean;
  maxWords: number;
  maxSeconds: number;
  fontSize: number;
};

export const DEFAULT_CAPTIONS: CaptionOptions = {
  enabled: true,
  maxWords: 6,
  maxSeconds: 3.2,
  fontSize: 40,
};

/* --------------------------------------------------------------- narration */

export type WordTiming = { word: string; start: number; end: number };

export type NarrationScene = {
  id: number;
  slug: string;
  /** URL path the composition loads, e.g. /projects/<id>/voice/scene-01.wav */
  wav: string;
  text: string;
  /** Which Piper voice spoke this scene. */
  voiceId?: string;
  duration: number;
  words: WordTiming[];
};

export type Narration = {
  fps: number;
  total: number;
  /** Every voice used in the project, as reported by the engine. */
  voices?: string[];
  scenes: NarrationScene[];
};

/* --------------------------------------------------------------- projects */

export type RenderRecord = {
  id: string;
  file: string;
  url: string;
  width: number;
  height: number;
  createdAt: string;
  bytes: number;
  mode: "draft" | "full";
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  fps: number;
  width: number;
  height: number;
  /** Seconds of breathing room between scenes. Keep in sync with make_srt(). */
  gap: number;
  theme: ThemeSpec;
  captions: CaptionOptions;
  /** Default Piper voice id for scenes that do not set their own ("lessac"). */
  voice: string;
  /** Characters this project can put on screen. */
  cast?: CharacterLook[];
  scenes: SceneSpec[];
  renders: RenderRecord[];
};

/* ------------------------------------------------------------------- jobs */

export type JobKind = "narrate" | "render";
export type JobState = "queued" | "running" | "done" | "error";

export type Job = {
  id: string;
  projectId: string;
  kind: JobKind;
  state: JobState;
  /** 0..1 */
  progress: number;
  message: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  output?: string;
  log: string[];
};
