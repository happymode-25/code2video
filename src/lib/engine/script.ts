import { parse as parseYaml, stringify as toYamlString } from "yaml";
import { z } from "zod";
import { normaliseTheme } from "./themes";
import { voiceLabel } from "./voices";
import type { CharacterLook } from "./cast";
import type { Block, SceneSpec } from "./types";

/**
 * The two ways to write a script, kept in sync by the editor:
 *
 *   prose  - plain writing. Split into scenes at blank lines / markdown
 *            headings, with a visual block inferred for each scene.
 *   YAML   - the full project, every block spelled out. This is the source of
 *            truth once you touch it.
 *
 * `proseToScenes()` is deliberately rule-based (no model call) so the same
 * input always produces the same scenes.
 */

/* -------------------------------------------------------------- validation */

const SHORT = 200;

const cardSchema = z.object({
  label: z.string().min(1),
  value: z.string().optional(),
  hint: z.string().optional(),
});

const sideSchema = z.object({
  title: z.string(),
  items: z.array(z.string()).default([]),
});

const stackLayerSchema = z.object({
  label: z.string().min(1),
  color: z.string().optional(),
});

const timelineEntrySchema = z.object({
  when: z.string().min(1),
  what: z.string().min(1),
  note: z.string().optional(),
});

const diagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  color: z.string().optional(),
  sub: z.string().optional(),
});

const diagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
});

const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("title"), text: z.string().min(1), sub: z.string().optional() }),
  z.object({ type: z.literal("bullets"), heading: z.string().optional(), items: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("cards"), heading: z.string().optional(), items: z.array(cardSchema).min(1) }),
  z.object({
    type: z.literal("stack"),
    heading: z.string().optional(),
    layers: z.array(stackLayerSchema).min(1),
    highlight: z.number().int().optional(),
  }),
  z.object({ type: z.literal("steps"), heading: z.string().optional(), items: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("compare"), heading: z.string().optional(), left: sideSchema, right: sideSchema }),
  z.object({
    type: z.literal("code"),
    heading: z.string().optional(),
    language: z.string().optional(),
    code: z.string().min(1),
  }),
  z.object({ type: z.literal("mnemonic"), phrase: z.string().min(1), expansion: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("outro"), text: z.string().min(1), sub: z.string().optional() }),
  /* --- documentation + teaching blocks --- */
  z.object({
    type: z.literal("quote"),
    text: z.string().min(1),
    who: z.string().optional(),
    source: z.string().optional(),
  }),
  z.object({
    type: z.literal("callout"),
    kind: z.enum(["note", "tip", "warning", "danger", "key"]).optional(),
    title: z.string().optional(),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("timeline"),
    heading: z.string().optional(),
    entries: z.array(timelineEntrySchema).min(1),
  }),
  z.object({
    type: z.literal("table"),
    heading: z.string().optional(),
    data: z.object({
      columns: z.array(z.string()).min(1),
      rows: z.array(z.array(z.string())).min(1),
    }),
    highlight: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("diagram"),
    heading: z.string().optional(),
    nodes: z.array(diagramNodeSchema).min(1),
    edges: z.array(diagramEdgeSchema).optional(),
  }),
  z.object({ type: z.literal("chapter"), number: z.string().optional(), title: z.string().min(1), sub: z.string().optional() }),
  z.object({ type: z.literal("stat"), heading: z.string().optional(), items: z.array(cardSchema).min(1), note: z.string().optional() }),
  z.object({ type: z.literal("keypoints"), heading: z.string().optional(), items: z.array(z.string()).min(1) }),
]);

const sceneSchema = z.object({
  id: z.number().int().positive().optional(),
  slug: z.string().optional(),
  title: z.string().optional(),
  accent: z.string().optional(),
  /** Voice id for this scene; falls back to the project voice. */
  voice: z.string().optional(),
  /** board (default) | character | dialogue. */
  mode: z.enum(["board", "character", "dialogue"]).optional(),
  /** Cast preset id or a character declared in the doc's `cast` list. */
  speaker: z.string().optional(),
  /** The other half of a two-hander. */
  listener: z.string().optional(),
  narration: z.string().min(1, "every scene needs narration"),
  blocks: z.array(blockSchema).default([]),
});

const captionsSchema = z.object({
  enabled: z.boolean().default(true),
  maxWords: z.number().int().min(1).max(12).default(6),
  maxSeconds: z.number().min(0.5).max(10).default(3.2),
  fontSize: z.number().min(16).max(80).default(40),
});

export const docSchema = z.object({
  name: z.string().default("Untitled"),
  theme: z.string().optional(),
  fps: z.number().int().min(10).max(60).default(30),
  width: z.number().int().min(320).default(1920),
  height: z.number().int().min(240).default(1080),
  gap: z.number().min(0).max(3).default(0.45),
  voice: z.string().optional(),
  /**
   * Named characters this script puts on screen. A scene's `speaker:`/`listener:`
   * can point here, or at a shared preset ("teacher"), or at nothing at all.
   */
  cast: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        skin: z.string().default("#E8B98F"),
        hair: z.string().default("#3A2A20"),
        shirt: z.string().default("#3498DB"),
        hairStyle: z.enum(["short", "bun", "long", "curly", "bald", "cap"]).default("short"),
        accessory: z.enum(["none", "glasses", "headphones", "tie", "scarf"]).optional(),
        build: z.enum(["slim", "regular", "broad"]).optional(),
      }),
    )
    .optional(),
  captions: captionsSchema.default({ enabled: true, maxWords: 6, maxSeconds: 3.2, fontSize: 40 }),
  scenes: z.array(sceneSchema).min(1, "add at least one scene"),
});

export type ScriptDoc = z.infer<typeof docSchema>;

export type ParseResult =
  | { ok: true; doc: ScriptDoc; scenes: SceneSpec[] }
  | { ok: false; errors: string[] };

function formatIssues(err: z.ZodError): string[] {
  return err.issues.slice(0, 12).map((issue) => {
    const where = issue.path.length ? issue.path.join(".") : "(root)";
    return `${where}: ${issue.message}`;
  });
}

/** Parse editor YAML into scenes. Never throws. */
export function parseScript(yamlText: string): ParseResult {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    return { ok: false, errors: [`YAML syntax: ${err instanceof Error ? err.message : String(err)}`] };
  }
  if (raw === null || raw === undefined) return { ok: false, errors: ["the document is empty"] };
  if (typeof raw !== "object") return { ok: false, errors: ["expected a YAML mapping at the top level"] };

  const parsed = docSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error) };

  const scenes = parsed.data.scenes.map((s, i) => normaliseScene(s, i));
  return { ok: true, doc: parsed.data, scenes };
}

function normaliseScene(
  s: z.infer<typeof sceneSchema>,
  index: number,
): SceneSpec {
  const id = s.id ?? index + 1;
  const narration = s.narration.trim();
  return {
    id,
    slug: s.slug || `scene-${String(id).padStart(2, "0")}`,
    title: s.title || firstWords(narration, 6) || `Scene ${id}`,
    narration,
    accent: s.accent,
    voice: s.voice,
    mode: s.mode,
    speaker: s.speaker,
    listener: s.listener,
    blocks: s.blocks.length ? (s.blocks as Block[]) : inferBlocks(narration, s.title),
  };
}

/** Resolve `theme: midnight` (a name) into a full theme object. */
export function themeFromDoc(doc: ScriptDoc) {
  return normaliseTheme(doc.theme ? { name: doc.theme } : undefined);
}

/** The project-level settings a parsed document carries. */
export function settingsFromDoc(doc: ScriptDoc) {
  return {
    theme: themeFromDoc(doc),
    fps: doc.fps,
    width: doc.width,
    height: doc.height,
    gap: doc.gap,
    captions: doc.captions,
    voice: doc.voice ?? "",
    cast: doc.cast as CharacterLook[] | undefined,
  };
}

/* ------------------------------------------------------------ serialisation */

const QUOTE_NEEDED = /^[\s>|&*!%@`{}[\]",#?:-]|[:#]\s|\s$|^\s*$|[\n\t]/;

function yamlScalar(value: string): string {
  if (value.length > SHORT || QUOTE_NEEDED.test(value) || /^[\d.+-]+$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function blockToYaml(block: Block): string {
  const lines: string[] = [];
  const head = (extra: Record<string, unknown> = {}) => {
    lines.push(`      - type: ${block.type}`);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === null) continue;
      lines.push(`        ${k}: ${typeof v === "number" ? v : yamlScalar(String(v))}`);
    }
  };

  switch (block.type) {
    case "title":
      head({ text: block.text, sub: block.sub });
      break;
    case "outro":
      head({ text: block.text, sub: block.sub });
      break;
    case "mnemonic":
      head({ phrase: block.phrase });
      lines.push(`        expansion:`);
      for (const item of block.expansion) lines.push(`          - ${yamlScalar(item)}`);
      break;
    case "bullets":
      head({ heading: block.heading });
      lines.push(`        items:`);
      for (const item of block.items) lines.push(`          - ${yamlScalar(item)}`);
      break;
    case "steps":
      head({ heading: block.heading });
      lines.push(`        items:`);
      for (const item of block.items) lines.push(`          - ${yamlScalar(item)}`);
      break;
    case "cards":
      head({ heading: block.heading });
      lines.push(`        items:`);
      for (const card of block.items) {
        lines.push(`          - label: ${yamlScalar(card.label)}`);
        if (card.value) lines.push(`            value: ${yamlScalar(card.value)}`);
        if (card.hint) lines.push(`            hint: ${yamlScalar(card.hint)}`);
      }
      break;
    case "stack":
      head({ heading: block.heading, highlight: block.highlight });
      lines.push(`        layers:`);
      for (const layer of block.layers) {
        lines.push(`          - label: ${yamlScalar(layer.label)}`);
        if (layer.color) lines.push(`            color: "${layer.color}"`);
      }
      break;
    case "compare":
      head({ heading: block.heading });
      lines.push(`        left:`);
      lines.push(`          title: ${yamlScalar(block.left.title)}`);
      lines.push(`          items:`);
      for (const item of block.left.items) lines.push(`            - ${yamlScalar(item)}`);
      lines.push(`        right:`);
      lines.push(`          title: ${yamlScalar(block.right.title)}`);
      lines.push(`          items:`);
      for (const item of block.right.items) lines.push(`            - ${yamlScalar(item)}`);
      break;
    case "code":
      head({ heading: block.heading, language: block.language });
      lines.push(`        code: |`);
      for (const line of block.code.split("\n")) lines.push(`          ${line}`);
      break;
    case "keypoints":
      head({ heading: block.heading });
      lines.push(`        items:`);
      for (const item of block.items) lines.push(`          - ${yamlScalar(item)}`);
      break;
    case "callout":
      head({ kind: block.kind, title: block.title, text: block.text });
      break;
    case "quote":
      head({ text: block.text, who: block.who, source: block.source });
      break;
    case "chapter":
      head({ number: block.number, title: block.title, sub: block.sub });
      break;
    case "timeline":
      head({ heading: block.heading });
      lines.push(`        entries:`);
      for (const entry of block.entries) {
        lines.push(`          - when: ${yamlScalar(entry.when)}`);
        lines.push(`            what: ${yamlScalar(entry.what)}`);
        if (entry.note) lines.push(`            note: ${yamlScalar(entry.note)}`);
      }
      break;
    case "stat":
      head({ heading: block.heading, note: block.note });
      lines.push(`        items:`);
      for (const card of block.items) {
        lines.push(`          - label: ${yamlScalar(card.label)}`);
        if (card.value) lines.push(`            value: ${yamlScalar(card.value)}`);
        if (card.hint) lines.push(`            hint: ${yamlScalar(card.hint)}`);
      }
      break;
    case "table":
      head({ heading: block.heading, highlight: block.highlight });
      lines.push(`        data:`);
      lines.push(`          columns:`);
      for (const column of block.data.columns) lines.push(`            - ${yamlScalar(column)}`);
      lines.push(`          rows:`);
      for (const row of block.data.rows) {
        lines.push(`            - [${row.map((cell) => yamlScalar(cell)).join(", ")}]`);
      }
      break;
    case "diagram":
      head({ heading: block.heading });
      lines.push(`        nodes:`);
      for (const node of block.nodes) {
        lines.push(`          - id: ${yamlScalar(node.id)}`);
        lines.push(`            label: ${yamlScalar(node.label)}`);
        if (node.color) lines.push(`            color: "${node.color}"`);
        if (node.sub) lines.push(`            sub: ${yamlScalar(node.sub)}`);
      }
      if (block.edges?.length) {
        lines.push(`        edges:`);
        for (const edge of block.edges) {
          lines.push(`          - from: ${yamlScalar(edge.from)}`);
          lines.push(`            to: ${yamlScalar(edge.to)}`);
          if (edge.label) lines.push(`            label: ${yamlScalar(edge.label)}`);
        }
      }
      break;
  }
  return lines.join("\n");
}

export type SerializableProject = {
  name: string;
  theme: { name: string };
  fps?: number;
  width?: number;
  height?: number;
  gap?: number;
  voice?: string;
  /** Named characters on screen; referenced by scene `speaker`/`listener`. */
  cast?: CharacterLook[];
  captions?: { enabled: boolean; maxWords: number; maxSeconds: number; fontSize: number };
  scenes: SceneSpec[];
};

/** Defaults for the optional settings, so callers only pass what they mean. */
const DEFAULTS = {
  fps: 30,
  width: 1920,
  height: 1080,
  gap: 0.45,
  voice: "lessac",
  captions: { enabled: true, maxWords: 6, maxSeconds: 3.2, fontSize: 40 },
};

export function toScriptYaml(project: SerializableProject): string {
  const fps = project.fps ?? DEFAULTS.fps;
  const width = project.width ?? DEFAULTS.width;
  const height = project.height ?? DEFAULTS.height;
  const gap = project.gap ?? DEFAULTS.gap;
  const captions = project.captions ?? DEFAULTS.captions;
  const lines: string[] = [];
  lines.push(`# code2video script`);
  lines.push(`# Edit freely - the preview re-renders as you type.`);
  lines.push(`# voices: lessac (US f) | amy (US f) | alan (GB m) - see the Voice panel.`);
  lines.push(`name: ${yamlScalar(project.name)}`);
  // Defensive: a caller that forgets `theme` should get the default theme name,
  // not a literal "undefined" written into the YAML.
  lines.push(`theme: ${project.theme?.name ?? "midnight"}`);
  lines.push(`fps: ${fps}`);
  lines.push(`width: ${width}`);
  lines.push(`height: ${height}`);
  lines.push(`gap: ${gap}`);
  lines.push(`voice: ${yamlScalar(project.voice || DEFAULTS.voice)}`);
  lines.push(`captions:`);
  lines.push(`  enabled: ${captions.enabled}`);
  lines.push(`  maxWords: ${captions.maxWords}`);
  lines.push(`  maxSeconds: ${captions.maxSeconds}`);
  lines.push(`  fontSize: ${captions.fontSize}`);
  if (project.cast?.length) {
    lines.push(`# The cast. Scenes point at these with speaker: / listener:.`);
    lines.push(`cast:`);
    for (const person of project.cast) {
      lines.push(`  - id: ${yamlScalar(person.id)}`);
      lines.push(`    name: ${yamlScalar(person.name)}`);
      lines.push(`    skin: "${person.skin}"`);
      lines.push(`    hair: "${person.hair}"`);
      lines.push(`    shirt: "${person.shirt}"`);
      lines.push(`    hairStyle: ${person.hairStyle}`);
      if (person.accessory && person.accessory !== "none") lines.push(`    accessory: ${person.accessory}`);
      if (person.build) lines.push(`    build: ${person.build}`);
    }
  }
  lines.push(`scenes:`);
  for (const scene of project.scenes) {
    lines.push(`  - id: ${scene.id}`);
    lines.push(`    slug: ${yamlScalar(scene.slug)}`);
    lines.push(`    title: ${yamlScalar(scene.title)}`);
    if (scene.accent) lines.push(`    accent: "${scene.accent}"`);
    if (scene.voice) lines.push(`    voice: ${yamlScalar(scene.voice)}`);
    if (scene.mode && scene.mode !== "board") lines.push(`    mode: ${scene.mode}`);
    if (scene.speaker) lines.push(`    speaker: ${yamlScalar(scene.speaker)}`);
    if (scene.listener) lines.push(`    listener: ${yamlScalar(scene.listener)}`);
    lines.push(`    narration: >-`);
    for (const line of wrap(scene.narration, 76)) lines.push(`      ${line}`);
    if (scene.blocks.length) {
      lines.push(`    blocks:`);
      for (const block of scene.blocks) lines.push(blockToYaml(block));
    }
  }
  return `${lines.join("\n")}\n`;
}

function wrap(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line.length) line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/* ------------------------------------------------------------- prose -> scenes */

function firstWords(text: string, n: number): string {
  return text.replace(/\s+/g, " ").trim().split(" ").slice(0, n).join(" ").replace(/[,:;.]$/, "");
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Infer a sensible set of visual blocks from a scene's narration. */
export function inferBlocks(narration: string, title?: string): Block[] {
  const text = narration.replace(/\s+/g, " ").trim();
  const sentences = splitSentences(text);
  const blocks: Block[] = [];
  const heading = title?.trim() || firstWords(text, 6) || "Scene";

  blocks.push({ type: "title", text: heading, sub: firstWords(sentences[0] ?? text, 9) });

  // "HTTP, FTP, SMTP, and DNS" -> cards
  const listSentence = sentences.find((s) => {
    const parts = s.split(/,| and | or /i).map((p) => p.trim()).filter(Boolean);
    return parts.length >= 3 && s.split(" ").length <= 22;
  });
  if (listSentence) {
    const items = listSentence
      .replace(/^[^:]*:\s*/, "")
      .replace(/[.!?]$/, "")
      .split(/,| and | or /i)
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (items.length >= 2) {
      blocks.push({ type: "cards", items: items.map((label) => ({ label })) });
      return blocks;
    }
  }

  // "First ... Second ... Third ..." -> steps
  const ordinal = sentences.filter((s) => /^(first|second|third|then|next|finally)\b/i.test(s));
  if (ordinal.length >= 2) {
    blocks.push({
      type: "steps",
      items: ordinal.map((s) => firstWords(s.replace(/^(first|second|third|then|next|finally)[,\s]*/i, ""), 7)),
    });
    return blocks;
  }

  // "X is 40 percent" / "costs 12 million" -> a stat, the loudest single number.
  const stat = findStat(sentences);
  if (stat) {
    blocks.push({
      type: "stat",
      items: [{ label: firstWords(stat.label, 8) || stat.sentence, value: stat.value }],
    });
    const rest = sentences
      .filter((s) => s !== stat.sentence)
      .slice(0, 3)
      .map((s) => firstWords(s, 8));
    if (rest.length) blocks.push({ type: "bullets", items: rest });
    return blocks;
  }

  // "In 1998 ..." / "By 2030 ..." -> a timeline when two or more dates appear.
  const dated = sentences
    .map((s) => ({ s, year: /\b(1[6-9]\d{2}|20\d{2})\b/.exec(s)?.[1] }))
    .filter((d): d is { s: string; year: string } => Boolean(d.year));
  const uniqueYears = new Set(dated.map((d) => d.year));
  if (dated.length >= 2 && uniqueYears.size >= 2) {
    blocks.push({
      type: "timeline",
      entries: dated.slice(0, 5).map((d) => ({
        when: d.year,
        what: firstWords(d.s.replace(/\b(1[6-9]\d{2}|20\d{2})\b/, "").trim(), 7) || d.s,
      })),
    });
    return blocks;
  }

  // Two or more "term — meaning" clauses become a two-column table.
  const table = findTable(sentences);
  if (table) {
    blocks.push({
      type: "table",
      data: { columns: ["Term", "Meaning"], rows: table.map((r) => r.cells) },
    });
    return blocks;
  }

  // A quoted line becomes a pull-quote when it stands on its own.
  const quote = sentences.length === 1 ? /^["“](.+)["”]$/.exec(text) : null;
  if (quote) {
    blocks.push({ type: "quote", text: quote[1] });
    return blocks;
  }

  // default: bullets from the strongest sentences
  const bullets = sentences
    .slice(1)
    .map((s) => firstWords(s, 8))
    .filter(Boolean)
    .slice(0, 5);
  blocks.push({ type: "bullets", items: bullets.length ? bullets : [firstWords(text, 8)] });
  return blocks;
}

/**
 * Find the most quotable number in a scene: a percentage, a currency amount, or
 * a plain magnitude. Deliberately conservative — a stray number like "the 3rd
 * layer" should not hijack a scene into a giant `stat` card.
 */
function findStat(sentences: string[]): { value: string; label: string; sentence: string } | null {
  const patterns = [
    /\b(\d[\d,.]*\s?(?:%|percent))\b/i,
    /\b([$€£₹]\s?\d[\d,.]*\s?(?:billion|million|thousand|bn|m|k)?)\b/i,
    /\b(\d[\d,.]*\s?(?:billion|million|thousand))\b/i,
    /\b(\d+(?:\.\d+)?\s?(?:x|times))\b/i,
  ];
  for (const sentence of sentences) {
    // Only short, punchy sentences; a long one makes a bad headline stat.
    if (sentence.split(" ").length > 18) continue;
    for (const re of patterns) {
      const m = re.exec(sentence);
      if (!m) continue;
      const label = sentence
        .replace(m[0], "")
        .replace(/^(it|this|that|which|and|is|was|are|were)\b[,\s]*/i, "")
        .trim();
      return { value: m[1].trim(), label: label || sentence, sentence };
    }
  }
  return null;
}

/** Two or more "Term — meaning" / "Term: meaning" clauses become table rows. */
function findTable(sentences: string[]): { cells: string[] }[] | null {
  const rows: { cells: string[] }[] = [];
  const re = /^\s*([^:—-]{2,28})\s*(?::|—|–|-)\s*(.{2,60})$/;
  for (const sentence of sentences) {
    const m = re.exec(sentence.replace(/[.!?]$/, ""));
    if (m) rows.push({ cells: [m[1].trim(), m[2].trim()] });
  }
  return rows.length >= 2 ? rows.slice(0, 6) : null;
}

export type ProseScene = { heading: string | null; body: string };

/** Split raw prose into (heading, body) chunks at blank lines / markdown headings. */
export function splitProse(prose: string): ProseScene[] {
  const lines = prose.replace(/\r\n/g, "\n").split("\n");
  const chunks: ProseScene[] = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  const push = () => {
    const body = buffer.join("\n").trim();
    if (body) chunks.push({ heading, body });
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const md = /^#{1,6}\s+(.*)$/.exec(line);
    const labelled = /^(?:scene|chapter|section)\s*\d*\s*[:\-]\s*(.+)$/i.exec(line);
    if (md || labelled) {
      push();
      heading = (md ? md[1] : labelled![1]).trim();
      continue;
    }
    if (!line) {
      push();
      continue;
    }
    buffer.push(line);
  }
  push();

  // No headings at all: fall back to blank-line paragraphs.
  if (!chunks.length) {
    return prose
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((body) => ({ heading: null, body }));
  }
  return chunks;
}

/** Group sentences so no scene runs longer than `maxWords`. */
function splitLongBody(body: string, maxWords = 42): string[] {
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [body];
  const sentences = splitSentences(body);
  const out: string[] = [];
  let current: string[] = [];
  let count = 0;
  for (const sentence of sentences) {
    const n = sentence.split(/\s+/).length;
    if (count + n > maxWords && current.length) {
      out.push(current.join(" "));
      current = [];
      count = 0;
    }
    current.push(sentence);
    count += n;
  }
  if (current.length) out.push(current.join(" "));
  return out;
}

export type ProseSplitOptions = { maxWordsPerScene?: number; keepHeadings?: boolean };

/** Prose -> scenes. Deterministic, no model call. */
export function proseToScenes(prose: string, opts: ProseSplitOptions = {}): SceneSpec[] {
  const maxWords = opts.maxWordsPerScene ?? 42;
  const chunks = splitProse(prose);
  const scenes: SceneSpec[] = [];
  let id = 1;

  for (const chunk of chunks) {
    const bodies = splitLongBody(chunk.body, maxWords);
    bodies.forEach((body, partIndex) => {
      const base = chunk.heading && opts.keepHeadings !== false ? chunk.heading : undefined;
      const title =
        bodies.length > 1 && base ? `${base} (${partIndex + 1})` : base || firstWords(body, 6) || `Scene ${id}`;
      scenes.push({
        id,
        slug: `scene-${String(id).padStart(2, "0")}`,
        title: title.slice(0, 60),
        narration: body.replace(/\s+/g, " ").trim(),
        blocks: inferBlocks(body, title),
      });
      id += 1;
    });
  }

  if (!scenes.length) return [];
  const last = scenes[scenes.length - 1];
  scenes[scenes.length - 1] = {
    ...last,
    blocks: [...last.blocks.filter((b) => b.type !== "outro"), { type: "outro", text: last.title, sub: "Thanks for watching" }],
  };
  return scenes;
}

/** Scenes -> prose, so the prose tab round-trips an edited YAML. */
export function scenesToProse(scenes: SceneSpec[]): string {
  return scenes
    .map((s) => {
      const speaker = s.voice ? ` [${voiceLabel(s.voice)}]` : "";
      return `## ${s.title}${speaker}\n\n${s.narration.replace(/\s+/g, " ").trim()}`;
    })
    .join("\n\n");
}

export { toYamlString };
