/**
 * Checks `mouthAt` behaves like a mouth rather than a random number generator.
 *
 * The claim in characters.tsx is that the mouth is driven by the real word
 * timings: open on a spoken syllable, shut in the gaps. That is testable.
 */
import { mouthAt } from "../src/remotion/characters";
import type { WordTiming } from "../src/lib/engine/types";

const FPS = 30;
const words: WordTiming[] = [
  { word: "Networking", start: 0.0, end: 0.52 },
  { word: "is", start: 0.52, end: 0.72 },
  { word: "layered", start: 0.72, end: 1.24 },
  // gap 1.24 -> 2.00 (a pause between sentences)
  { word: "Good", start: 2.0, end: 2.4 },
];

type Row = { t: number; open: number; where: string };
const rows: Row[] = [];

// Sample the middle of each word and the middle of the quiet gap.
const samples: { t: number; where: string }[] = [
  { t: 0.26, where: "mid Networking" },
  { t: 0.62, where: "mid is" },
  { t: 0.98, where: "mid layered" },
  { t: 1.5, where: "gap (pause)" },
  { t: 1.8, where: "gap (pause)" },
  { t: 2.2, where: "mid Good" },
];

for (const s of samples) {
  const m = mouthAt(words, s.t, FPS);
  rows.push({ t: s.t, open: m.open, where: s.where });
}

let fails = 0;
console.log("t      open   shape            where");
for (const r of rows) {
  const shape = r.open < 0.08 ? "closed" : r.open < 0.45 ? "parted" : "open";
  console.log(`${r.t.toFixed(2)}   ${r.open.toFixed(3)}  ${shape.padEnd(16)} ${r.where}`);
}

// Assertion 1: every word has a visibly open mouth somewhere inside it.
for (const w of words) {
  let peak = 0;
  for (let t = w.start; t <= w.end; t += 1 / (FPS * 2)) {
    peak = Math.max(peak, mouthAt(words, t, FPS).open);
  }
  const ok = peak > 0.25;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  "${w.word}" peaks at ${peak.toFixed(3)} while spoken`);
}

// Assertion 2: the quiet gap stays (near) shut for its whole length.
let gapPeak = 0;
for (let t = 1.3; t <= 1.95; t += 1 / (FPS * 2)) {
  gapPeak = Math.max(gapPeak, mouthAt(words, t, FPS).open);
}
{
  const ok = gapPeak < 0.2;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  gap stays shut (peak ${gapPeak.toFixed(3)})`);
}

// Assertion 3: silence (no words at all) is a closed mouth, and never NaN.
{
  const m = mouthAt([], 1.0, FPS);
  const ok = m.open === 0 && m.wide === 0;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  empty word list -> closed mouth`);
}

// Assertion 4: deterministic - the same moment always gives the same shape.
{
  let ok = true;
  for (let t = 0; t < 2.4; t += 0.07) {
    const a = mouthAt(words, t, FPS);
    const b = mouthAt(words, t, FPS);
    if (a.open !== b.open || a.wide !== b.wide) ok = false;
  }
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  deterministic across calls`);
}

// Assertion 5: never escapes [0,1] (a runaway mouth would look broken).
{
  let ok = true;
  for (let t = 0; t < 2.6; t += 0.011) {
    const m = mouthAt(words, t, FPS);
    if (!Number.isFinite(m.open) || m.open < 0 || m.open > 1) ok = false;
  }
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  open stays finite and within [0,1]`);
}

console.log(fails ? `\n${fails} FAILED` : "\nlip-sync checks passed");
process.exit(fails ? 1 : 0);
