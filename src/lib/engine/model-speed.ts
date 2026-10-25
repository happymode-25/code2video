import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";

/**
 * Measured tokens/second per model, so the writer can pick something that
 * finishes on this CPU and can warn honestly before a long wait.
 *
 * First run measures; later runs reuse the number. On a 4-core laptop this is
 * the difference between a 3-minute script attempt and a 25-minute one.
 */

export type Speed = {
  model: string;
  tokensPerSecond: number;
  /** Seconds the measurement itself took. */
  firstTokenSeconds: number;
  measuredAt: string;
};

const CACHE_FILE = `${paths.uploadsDir}/model-speed.json`;

function readCache(): Record<string, Speed> {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    // Tolerate a BOM: this file is small and may be hand-edited.
    return JSON.parse(raw.replace(/^\uFEFF/, "")) as Record<string, Speed>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, Speed>): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch {
    // A missing cache only costs us a re-measure.
  }
}

export function cachedSpeed(model: string): Speed | null {
  return readCache()[model] ?? null;
}

export function cachedSpeeds(): Record<string, Speed> {
  return readCache();
}

export function rememberSpeed(speed: Speed): void {
  const cache = readCache();
  cache[speed.model] = speed;
  writeCache(cache);
}

/** Below this, writing a full script in one generation is unreasonable. */
export const USABLE_TPS = 3;

export function isUsable(speed: Speed | null): boolean {
  if (!speed) return true; // unknown: give it the benefit of the doubt
  return speed.tokensPerSecond >= USABLE_TPS;
}

/**
 * Rough wall-clock estimate for a script of `scenes` scenes.
 * One scene costs about 150 generated tokens plus a shared system prompt.
 */
export function estimateSeconds(speed: Speed | null, scenes: number): number {
  if (!speed) return 0;
  const generated = scenes * 150;
  return generated / Math.max(0.1, speed.tokensPerSecond) + speed.firstTokenSeconds;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
