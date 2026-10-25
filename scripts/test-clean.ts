/**
 * Proves the writer's cleanup removes the punctuation a model emits that a
 * voice or a caption cannot use (mojibake, em dashes, curly quotes).
 *
 * Exported on purpose so the writer regressions stay testable.
 */
import { cleanNarration, cleanField } from "../src/lib/engine/writer";

const narrationCases: { input: string; expect: string; why: string }[] = [
  {
    input: "an old phone with a new model\u00e2\u20ac\u201deverything works better",
    expect: "an old phone with a new model, everything works better",
    why: "UTF-8 em dash decoded as latin-1 (the bug seen in a real write)",
  },
  {
    input: "a new model\uFFFD??everything works better",
    expect: "a new model everything works better",
    why: "replacement glyph + stray question marks",
  },
  {
    input: "The seven layers \u2014 physical through application \u2014 each do one job.",
    expect: "The seven layers, physical through application, each do one job.",
    why: "a real em dash becomes a spoken pause",
  },
  {
    input: "It depends\u2026 on the layer.",
    expect: "It depends, on the layer.",
    why: "ellipsis",
  },
  {
    input: "Amy: Every message crosses the world.",
    expect: "Every message crosses the world.",
    why: "speaker prefix is dropped (already on screen)",
  },
  {
    input: '"Every message crosses the world."',
    expect: "Every message crosses the world.",
    why: "wrapping quotes stripped",
  },
  {
    input: "“Premature optimisation is the root of all evil.”",
    expect: "Premature optimisation is the root of all evil.",
    why: "curly quotes normalised to straight, then stripped as wrapping quotes",
  },
  {
    input: "Normal  text   with    odd spacing.",
    expect: "Normal text with odd spacing.",
    why: "spacing collapsed",
  },
];

const fieldCases: { input: string; expect: string | undefined }[] = [
  { input: "None", expect: undefined },
  { input: "N/A", expect: undefined },
  { input: "—", expect: undefined },
  { input: "  ", expect: undefined },
  { input: '"Easier to test"', expect: "Easier to test" },
  // A colon is a table-cell separator, so it must survive untouched.
  { input: "Layer: three", expect: "Layer: three" },
  { input: "state-of-the-art", expect: "state-of-the-art" },
  // A spaced dash is punctuation, so it becomes a pause.
  { input: "one — two", expect: "one, two" },
];

let fails = 0;
for (const c of narrationCases) {
  const got = cleanNarration(c.input);
  const ok = got === c.expect;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.why}`);
  if (!ok) console.log(`      got:      ${JSON.stringify(got)}\n      expected: ${JSON.stringify(c.expect)}`);
}

for (const c of fieldCases) {
  const got = cleanField(c.input);
  const ok = got === c.expect;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  field ${JSON.stringify(c.input)} -> ${JSON.stringify(got)}`);
}

// The specific thing that must never survive into a voice or a caption.
const nasty = "a new model\uFFFD??everything \u2014 really";
const cleaned = cleanNarration(nasty);
{
  const ok = !/[\uFFFD\u00e2\u20ac]/.test(cleaned) && !cleaned.includes("\u2014");
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  no mojibake or em dash survives: ${JSON.stringify(cleaned)}`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall cleanup cases passed");
process.exit(fails ? 1 : 0);
