import fs from "node:fs";
import { paths } from "./paths";
import { VOICES, isVoicePath, voiceById } from "./voices";

/**
 * The disk half of the voice registry: resolving a voice id to an absolute
 * `.onnx` path and reporting what is actually installed.
 *
 * This is split from `voices.ts` on purpose. The Remotion composition imports
 * the pure registry and must stay free of `node:fs`, so anything that touches
 * the filesystem lives here and is imported only by server code.
 */

/**
 * Turn whatever is in the document into an absolute .onnx path.
 * Returns undefined when the id is unknown so the caller can warn and fall back.
 */
export function voicePath(value: string | null | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (isVoicePath(raw)) return fs.existsSync(/* turbopackIgnore: true */ raw) ? raw : undefined;
  const voice = voiceById(raw);
  return voice ? `${paths.voicesDir}/${voice.file}` : undefined;
}

export type VoiceStatus = {
  id: string;
  label: string;
  installed: boolean;
  path: string;
  missing: string[];
};

/** Which voice files are actually on disk. */
export function voiceStatus(): VoiceStatus[] {
  return VOICES.map((v) => {
    const model = `${paths.voicesDir}/${v.file}`;
    const config = `${model}.json`;
    const missing = [model, config].filter((f) => !fs.existsSync(/* turbopackIgnore: true */ f));
    return { id: v.id, label: v.label, installed: missing.length === 0, path: model, missing };
  });
}

export function installedVoiceIds(): string[] {
  return voiceStatus()
    .filter((s) => s.installed)
    .map((s) => s.id);
}
