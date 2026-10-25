/**
 * Which local Ollama model writes the scripts.
 *
 * Kept in its own module with no imports so both the health probe and the
 * writer can agree on the order without creating a cycle.
 */

/** Best first. Anything else the machine has installed is offered too. */
export const PREFERRED_WRITER_MODELS = [
  "qwen2.5:7b",
  "qwen2.5:latest",
  "llama3.1:8b",
  "qwen2.5-coder:7b",
  "qwen2.5-coder:3b",
  "llama3.2:3b",
  "phi4:latest",
];

/** Tagged sizes are big; prefer them for prose quality. */
export function pickWriterModel(available: string[]): string | null {
  if (!available.length) return null;
  for (const wanted of PREFERRED_WRITER_MODELS) {
    if (available.includes(wanted)) return wanted;
  }
  // Fall back to the first non-embedding model, preferring bigger ones.
  const usable = available.filter((m) => !/embed|minilm|bge/i.test(m));
  if (!usable.length) return available[0];
  const score = (name: string) => {
    const size = /:(\d+(?:\.\d+)?)b/i.exec(name);
    return size ? Number(size[1]) : 0;
  };
  return [...usable].sort((a, b) => score(b) - score(a))[0];
}

export type WriterModel = { id: string; label: string; hint: string };

export function describeModel(id: string): WriterModel {
  const known = PREFERRED_WRITER_MODELS.indexOf(id);
  return {
    id,
    label: id,
    hint:
      known === 0
        ? "recommended - best prose"
        : known > 0
          ? "known good"
          : "installed",
  };
}
