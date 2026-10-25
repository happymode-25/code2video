/**
 * Proves the prose -> blocks inference produces blocks the real zod schema
 * accepts, for each new doc/education shape.
 */
import { inferBlocks, proseToScenes, toScriptYaml, parseScript } from "../src/lib/engine/script";

const cases: { name: string; narration: string; expect: string }[] = [
  {
    name: "stat",
    narration:
      "Roughly 60 percent of the cost comes from moving data. Latency is the second driver. Storage is comparatively cheap.",
    expect: "stat",
  },
  {
    name: "timeline",
    narration:
      "In 1998 the first standard shipped. By 2005 it was widely adopted. In 2020 the second generation arrived with stronger guarantees.",
    expect: "timeline",
  },
  {
    name: "table",
    narration:
      "Cache: fast temporary storage. Index: a lookup structure that avoids full scans. Shard: a horizontal slice of the data.",
    expect: "table",
  },
  {
    name: "quote",
    narration: "“Premature optimisation is the root of all evil.”",
    expect: "quote",
  },
  {
    name: "cards",
    narration: "The main options are TCP, UDP, and QUIC.",
    expect: "cards",
  },
  {
    name: "steps",
    narration: "First you resolve the name. Then you open a connection. Finally you send the request.",
    expect: "steps",
  },
  {
    name: "bullets",
    narration:
      "This section explains the general idea without any special structure. It keeps talking for a while. It adds one more sentence here. And a fourth one so there is something to bullet.",
    expect: "bullets",
  },
];

let failures = 0;
for (const c of cases) {
  const blocks = inferBlocks(c.narration, "Test Scene");
  const types = blocks.map((b) => b.type);
  const hit = types.includes(c.expect as never);

  // Round-trip through YAML + the real parser, which is what the editor does.
  const scenes = proseToScenes(`# Test Scene\n\n${c.narration}`);
  const yaml = toScriptYaml({
    name: "Infer Test",
    theme: { name: "midnight" },
    fps: 30,
    width: 1920,
    height: 1080,
    gap: 0.45,
    voice: "lessac",
    captions: { enabled: true, maxWords: 6, maxSeconds: 3.2, fontSize: 40 },
    scenes,
  });
  const reparsed = parseScript(yaml);

  const ok = hit && reparsed.ok;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(9)} inferred=[${types.join(",")}]  yaml=${reparsed.ok ? "parse OK" : "PARSE FAIL"}`,
  );
  if (!hit) console.log(`      ^ expected a "${c.expect}" block`);
  if (!reparsed.ok) console.log(`      ${reparsed.errors.slice(0, 3).join("; ")}`);
}

// Show the inferred stat block round-tripped through the real serialiser.
console.log("\nsample stat block as YAML (first scenes only):");
console.log(
  toScriptYaml({
    name: "Stat",
    theme: { name: "midnight" },
    fps: 30,
    width: 1920,
    height: 1080,
    gap: 0.45,
    voice: "lessac",
    captions: { enabled: true, maxWords: 6, maxSeconds: 3.2, fontSize: 40 },
    scenes: [
      {
        id: 1,
        slug: "s1",
        title: "Cost",
        narration: "Roughly 60 percent of the cost comes from moving data.",
        blocks: [{ type: "stat", items: [{ label: "cost of moving data", value: "60%" }] }],
      },
    ],
  }),
);

console.log(failures ? `\n${failures} FAILED` : "\nall inference cases passed");
process.exit(failures ? 1 : 0);
