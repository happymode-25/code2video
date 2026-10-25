/**
 * Exercises the AI writer without the web app.
 *
 *   npx tsx scripts/test-writer.ts            # default: 2-voice lesson
 *   npx tsx scripts/test-writer.ts <file.txt> # write from your own notes
 *
 * Needs Ollama running with a model installed.
 */
import fs from "node:fs";
import { writeScript, estimateWrite } from "../src/lib/engine/writer";
import { parseScript } from "../src/lib/engine/script";
import { voiceLabel } from "../src/lib/engine/voices";

const NOTES = `
Photosynthesis - lecture notes, week 3

Plants are not "eating" sunlight. They are running a chemical factory that runs on light.
The overall job: take carbon dioxide from the air and water from the soil, and use light to
rebuild them into glucose, releasing oxygen as the waste product.

Two stages.

Stage one: the light-dependent reactions. These happen in the thylakoid membranes inside the
chloroplast. Chlorophyll absorbs mostly red and blue light and reflects green, which is why
leaves look green. The absorbed energy is used to split water molecules - this is called
photolysis - and the by-product is oxygen gas. The energy is stored temporarily in two
carriers: ATP and NADPH. Neither of these lasts long. They are the batteries the second stage
will spend.

Stage two: the Calvin cycle. This happens in the stroma, the fluid around the thylakoids. It
does not need light directly. It uses the ATP and NADPH from stage one to fix carbon dioxide
into a three-carbon sugar, then rebuilds those into glucose. The enzyme that grabs the CO2 is
called RuBisCO, and it is probably the most abundant protein on Earth.

Limiting factors. If light is low, stage one is the bottleneck. If CO2 is low, stage two is
the bottleneck. Temperature matters because these are enzyme-driven reactions - too cold and
they slow down, too hot and the enzymes denature.

Common exam mistake: saying "plants eat sunlight". They do not. They capture the energy of
light, but the carbon for the plant body comes from carbon dioxide in the air.
`;

async function main() {
  const file = process.argv[2];
  const notes = file ? fs.readFileSync(file, "utf-8") : NOTES;

  console.log(`notes: ${notes.length} chars${file ? ` (from ${file})` : ""}`);
  console.log(`estimate: ${estimateWrite(notes, { notes, targetMinutes: 3 }, process.env.WRITER_MODEL ?? "qwen2.5:7b")}`);
  console.log("writing...\n");
  const started = Date.now();
  let lastStage = "";

  const result = await writeScript(
    {
      notes,
      topic: "Photosynthesis",
      audience: "GCSE biology students",
      targetMinutes: 3,
      voices: 2,
      style: "clear and friendly, a teacher talking to a class",
    },
    process.env.WRITER_MODEL,
    {
      onProgress: (p) => {
        if (p.stage !== lastStage) {
          console.log(`  stage: ${p.stage}  (${Math.round(p.progress * 100)}%)`);
          lastStage = p.stage;
        }
      },
    },
  );

  console.log(`\n== wrote in ${((Date.now() - started) / 1000).toFixed(1)}s ==`);
  console.log(`via:    ${result.via}`);
  console.log(`model:  ${result.model}`);
  console.log(`name:   ${result.name}`);
  console.log(`scenes: ${result.scenes.length}`);
  console.log(`notes:  ${result.notes.join(" | ")}`);

  console.log("\n== scenes ==");
  for (const s of result.scenes) {
    console.log(`\n[${s.id}] ${s.title}  ${s.voice ? `(${voiceLabel(s.voice)})` : ""}`);
    console.log(`    says: ${s.narration}`);
    for (const b of s.blocks) {
      const detail =
        b.type === "bullets" || b.type === "steps"
          ? b.items.join(" / ")
          : b.type === "title"
            ? `${b.text}${b.sub ? ` - ${b.sub}` : ""}`
            : b.type === "cards"
              ? b.items.map((i) => i.label).join(" / ")
              : b.type === "outro"
                ? b.text
                : b.type === "mnemonic"
                  ? `${b.phrase} = ${b.expansion.join("")}`
                  : b.type === "code"
                    ? b.code.replace(/\n/g, " ")
                    : JSON.stringify(b).slice(0, 90);
      console.log(`    shows ${b.type}: ${detail}`);
    }
  }

  // The point of the round-trip: the same parser the editor uses must accept it.
  const reparsed = parseScript(result.yaml);
  console.log(`\n== round-trip ==`);
  console.log(`parser accepts the written YAML: ${reparsed.ok}`);
  if (!reparsed.ok) {
    console.log(reparsed.errors.join("\n"));
    process.exit(1);
  }
  const words = result.scenes.reduce((n, s) => n + s.narration.split(/\s+/).length, 0);
  console.log(`narration words: ${words}  (~${(words / 150).toFixed(1)} min spoken)`);
  console.log(`voices used: ${[...new Set(result.scenes.map((s) => s.voice))].join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
