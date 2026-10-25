/**
 * The voices the app can speak with.
 *
 * A voice is referred to by its short `id` everywhere the user can see it
 * (YAML `voice: amy`, per-scene `voice:`, character `voice:`). The absolute
 * `.onnx` path is resolved at the last moment, so projects stay portable.
 *
 * A value that looks like a path (`C:\...\x.onnx`) is still honoured, which
 * keeps older documents working.
 *
 * IMPORTANT: this module is pure. It is imported by the Remotion composition,
 * which webpack bundles for the browser, so it must not reach for `node:fs` or
 * any other Node builtin. The disk-touching helpers live in `voice-files.ts`.
 */

export type VoiceGender = "female" | "male";

export type VoiceDef = {
  /** Stable key used in YAML. */
  id: string;
  label: string;
  lang: string;
  gender: VoiceGender;
  quality: "low" | "medium" | "high";
  /** File name inside the shared voices dir. */
  file: string;
  /** One line the UI shows under the name. */
  blurb: string;
  /** A role this voice reads well in. */
  best: string;
  /** Chip colour in the studio. */
  color: string;
};

export const VOICES: VoiceDef[] = [
  {
    id: "lessac",
    label: "Lessac",
    lang: "en-US",
    gender: "female",
    quality: "medium",
    file: "en_US-lessac-medium.onnx",
    blurb: "Warm, even US narration voice. The default.",
    best: "Narrator / explainer",
    color: "#4FD1FF",
  },
  {
    id: "amy",
    label: "Amy",
    lang: "en-US",
    gender: "female",
    quality: "medium",
    file: "en_US-amy-medium.onnx",
    blurb: "Bright US voice. Reads well as a teacher or a second speaker.",
    best: "Teacher / interviewer",
    color: "#1ABC9C",
  },
  {
    id: "alan",
    label: "Alan",
    lang: "en-GB",
    gender: "male",
    quality: "medium",
    file: "en_GB-alan-medium.onnx",
    blurb: "Calm British voice. Reads well as a documentary narrator.",
    best: "Documentary / expert",
    color: "#E67E22",
  },
];

export const DEFAULT_VOICE_ID = "lessac";

export function voiceById(id: string | null | undefined): VoiceDef | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase();
  return VOICES.find((v) => v.id === key);
}

/** True when a `voice:` value is a real path rather than a known voice id. */
export function isVoicePath(value: string): boolean {
  return /[\\/]/.test(value) || value.toLowerCase().endsWith(".onnx");
}

/** The voice to use for a scene: its own, else the project default, else Lessac. */
export function effectiveVoiceId(sceneVoice?: string, projectVoice?: string): string {
  return voiceById(sceneVoice)?.id ?? voiceById(projectVoice)?.id ?? DEFAULT_VOICE_ID;
}

export function voiceLabel(id: string | null | undefined): string {
  return voiceById(id)?.label ?? (id ? id : "default");
}

export function voiceColor(id: string | null | undefined): string {
  return voiceById(id)?.color ?? "#8FA0C8";
}
