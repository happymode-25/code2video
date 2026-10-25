import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pickWriterModel } from "./models";
import { voiceStatus } from "./voice-files";

/**
 * Resolves the local engine assets (Piper voice, whisper model, ffmpeg) and
 * reports what is missing. Every path can be overridden with an env var so the
 * app is not hard-wired to this machine.
 *
 * NOTE: paths are built as plain strings, not path.join() chains. Turbopack
 * tries to resolve constant-folded path.join() results as build assets and
 * panics on the ffmpeg .exe, so keep these as literals.
 */

const LAB = "C:/dev/video-lab";
const ROOT = process.cwd().replace(/\\/g, "/");

/**
 * Ollama's own docs set OLLAMA_HOST to a bare "127.0.0.1:11434", which fetch()
 * rejects. Add a scheme so either form works.
 */
function normaliseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(value)) return value;
  return `http://${value}`;
}

export const paths = {
  projectRoot: process.cwd(),
  publicDir: `${ROOT}/public`,
  projectsDir: `${ROOT}/public/projects`,
  jobsDir: `${ROOT}/data/jobs`,
  engineDir: `${ROOT}/engine`,
  narrateScript: `${ROOT}/engine/narrate.py`,
  pdfScript: `${ROOT}/engine/pdftext.py`,
  remotionEntry: `${ROOT}/src/remotion/index.ts`,
  python: process.env.C2V_PYTHON ?? "python",
  ffmpeg: process.env.C2V_FFMPEG ?? `${LAB}/tools/ffmpeg-9.0.2/bin/ffmpeg.exe`,
  ffprobe: process.env.C2V_FFPROBE ?? `${LAB}/tools/ffmpeg-9.0.2/bin/ffprobe.exe`,
  /** Folder holding every Piper voice; see lib/engine/voices.ts for the list. */
  voicesDir: process.env.C2V_VOICES_DIR ?? `${LAB}/voice-caption/voices`,
  /** Kept for older callers: the default voice model. */
  voice: process.env.C2V_VOICE ?? `${LAB}/voice-caption/voices/en_US-lessac-medium.onnx`,
  whisperDir: process.env.C2V_WHISPER ?? `${LAB}/voice-caption/models/faster-whisper-base`,
  /** Uploads (PDFs of notes) and everything the writer produces. */
  uploadsDir: `${ROOT}/data/uploads`,
  /** Base URL of the local Ollama daemon. Always normalised to have a scheme. */
  ollama: normaliseUrl(process.env.C2V_OLLAMA ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"),
};

export type Check = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  /** Blocks narration, rendering, or both. */
  critical: "narration" | "render" | "none";
};

let cached: { at: number; checks: Check[] } | null = null;
const CACHE_MS = 15_000;

function fileCheck(key: string, label: string, file: string, critical: Check["critical"]): Check {
  const exists = fs.existsSync(file);
  return {
    key,
    label,
    ok: exists,
    detail: exists ? file : `missing: ${file}`,
    critical: exists ? "none" : critical,
  };
}

function runCheck(key: string, label: string, bin: string, args: string[]): Check {
  try {
    const out = execFileSync(bin, args, {
      encoding: "utf-8",
      timeout: 20_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const first = out.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
    return { key, label, ok: true, detail: first.trim().slice(0, 120), critical: "none" };
  } catch (err) {
    return {
      key,
      label,
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 160) : String(err),
      critical: "none",
    };
  }
}

/** Remotion downloads its own headless Chrome on first render. */
function browserCheck(): Check {
  const candidates = [
    `${process.env.LOCALAPPDATA ?? ""}/remotion/chrome-headless-shell`,
    `${process.env.USERPROFILE ?? ""}/.remotion/chrome-headless-shell`,
  ];
  const found = candidates.find((c) => c.length > 20 && fs.existsSync(c));
  return {
    key: "chrome",
    label: "Remotion browser",
    ok: true,
    detail: found ? `cached: ${found}` : "not downloaded yet - fetched automatically on the first render",
    critical: "none",
  };
}

/** How many of the known Piper voices are on disk, and where. */
function voiceCheck(): Check {
  const status = voiceStatus();
  const installed = status.filter((s) => s.installed);
  const missing = status.filter((s) => !s.installed);
  return {
    key: "voices",
    label: "Piper voices",
    ok: installed.length > 0,
    detail: installed.length
      ? `${installed.length}/${status.length} installed: ${installed.map((v) => v.label).join(", ")}${
          missing.length ? ` - run: npm run voices (missing ${missing.map((v) => v.label).join(", ")})` : ""
        }`
      : `none installed - run: npm run voices`,
    // The default voice is only missing if *nothing* is installed.
    critical: installed.length ? "none" : "narration",
  };
}

/**
 * Is a local Ollama running with at least one model? The probe runs in a child
 * Node process because this function has to stay synchronous for the page render.
 */
function ollamaCheck(): Check {
  const probe = `
    fetch(${JSON.stringify(`${paths.ollama}/api/tags`)}, { signal: AbortSignal.timeout(5000) })
      .then((r) => r.json())
      .then((d) => {
        const models = (d.models || []).map((m) => m.name);
        if (!models.length) { console.error("Ollama is running but has no models - run: ollama pull qwen2.5:7b"); process.exit(1); }
        console.log(models.join(", "));
      })
      .catch((e) => { console.error("cannot reach Ollama at ${paths.ollama} (" + e.message + ") - run: ollama serve"); process.exit(1); });
  `;
  const check = runCheck("ollama", "Ollama (script writer)", process.execPath, ["-e", probe]);
  if (check.ok) {
    const models = check.detail.split(",").map((m) => m.trim()).filter(Boolean);
    const picked = pickWriterModel(models);
    check.detail = `${models.length} model(s), writer: ${picked ?? "none usable"}`;
  }
  if (!check.ok) check.detail = `${check.detail} - needed for "Write with AI"`;
  return check;
}

/** Cheap-ish capability probe. Cached briefly so the UI can poll it. */
export function health(force = false): Check[] {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.checks;

  const checks: Check[] = [
    runCheck("node", "Node runtime", process.execPath, ["--version"]),
    {
      key: "node-version",
      label: "Node 20+",
      ok: Number(process.versions.node.split(".")[0]) >= 20,
      detail: `v${process.versions.node}`,
      critical: "none",
    },
    runCheck("python", "Python", paths.python, ["--version"]),
    runCheck("python-deps", "piper + faster-whisper", paths.python, [
      "-c",
      "import piper, faster_whisper, numpy; print('piper, faster_whisper, numpy all import')",
    ]),
    fileCheck("ffmpeg", "ffmpeg", paths.ffmpeg, "render"),
    fileCheck("ffprobe", "ffprobe", paths.ffprobe, "none"),
    fileCheck("narrate", "narrate.py", paths.narrateScript, "narration"),
    fileCheck("remotion-entry", "Remotion entry", paths.remotionEntry, "render"),
    voiceCheck(),
    {
      key: "whisper",
      label: "whisper model",
      ok: fs.existsSync(`${paths.whisperDir}/model.bin`),
      detail: `${paths.whisperDir}/model.bin`,
      critical: fs.existsSync(`${paths.whisperDir}/model.bin`) ? "none" : "narration",
    },
    ollamaCheck(),
    browserCheck(),
  ];

  // A missing python dep is what actually breaks narration; make it critical.
  const deps = checks.find((c) => c.key === "python-deps");
  if (deps && !deps.ok) deps.critical = "narration";

  cached = { at: Date.now(), checks };
  return checks;
}

export function ensureDirs(): void {
  for (const dir of [paths.projectsDir, paths.jobsDir, paths.uploadsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function criticalFailures(scope: "narration" | "render"): Check[] {
  return health().filter((c) => !c.ok && c.critical === scope);
}

/** Kept for callers that already hand us a real path object. */
export const pathJoin = (...parts: string[]) => path.join(...parts);
