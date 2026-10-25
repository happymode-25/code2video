/**
 * Downloads the Piper voices code2video can speak with.
 *
 *   node scripts/fetch-voices.mjs              # fetch whatever is missing
 *   node scripts/fetch-voices.mjs --force      # re-download everything
 *
 * Voices land in the shared voice-caption voices folder so the app, the CLI
 * pipeline and osi-video all read the same files. Each voice is two files:
 * the .onnx model and its .onnx.json config.
 */
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const VOICES_DIR =
  process.env.C2V_VOICES_DIR ?? "C:/dev/video-lab/voice-caption/voices";

const BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main";

/** Keep in sync with src/lib/engine/voices.ts */
const VOICES = [
  { id: "lessac", files: ["en/en_US/lessac/medium/en_US-lessac-medium.onnx"], secondary: "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json" },
  { id: "amy", files: ["en/en_US/amy/medium/en_US-amy-medium.onnx"], secondary: "en/en_US/amy/medium/en_US-amy-medium.onnx.json" },
  { id: "alan", files: ["en/en_GB/alan/medium/en_GB-alan-medium.onnx"], secondary: "en/en_GB/alan/medium/en_GB-alan-medium.onnx.json" },
];

const force = process.argv.includes("--force");

const fmtMb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

async function download(remoteRel, dest) {
  const url = `${BASE}/${remoteRel}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await fs.rename(tmp, dest);
  const size = (await fs.stat(dest)).size;
  if (total && size !== total) throw new Error(`truncated: got ${size} of ${total} bytes`);
  return size;
}

async function main() {
  await fs.mkdir(VOICES_DIR, { recursive: true });
  let failed = 0;

  for (const voice of VOICES) {
    const parts = [
      { rel: voice.files[0], name: path.basename(voice.files[0]) },
      { rel: voice.secondary, name: path.basename(voice.secondary) },
    ];
    for (const part of parts) {
      const dest = path.join(VOICES_DIR, part.name);
      const exists = await fs
        .stat(dest)
        .then(() => true)
        .catch(() => false);
      if (exists && !force) {
        console.log(`  =  ${part.name}  (already present)`);
        continue;
      }
      process.stdout.write(`  >  ${part.name} ... `);
      try {
        const size = await download(part.rel, dest);
        console.log(fmtMb(size));
      } catch (err) {
        failed += 1;
        console.log(`FAILED: ${err.message}`);
      }
    }
  }

  console.log("");
  console.log(failed ? `${failed} file(s) failed.` : "all voices present.");
  console.log(`voices dir: ${VOICES_DIR}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
