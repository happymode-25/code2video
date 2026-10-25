import { generate } from "./ollama";
import { estimateSeconds, formatDuration, cachedSpeed, rememberSpeed, type Speed } from "./model-speed";
import { parseScript, toScriptYaml } from "./script";
import { DEFAULT_VOICE_ID, VOICES, voiceLabel } from "./voices";
import type { Block, SceneSpec } from "./types";

/**
 * Turns notes into a script with a local model, on hardware that is not a
 * server.
 *
 * Lessons learned the hard way on a 4-core CPU:
 *
 *  1. A small model asked for deeply nested JSON starts emitting *positional
 *     arrays* (`["title","Light Reactions","Sunlight splits water..."]`) instead
 *     of objects. So scene planning uses a flat shape with a `slots` array and
 *     no nested objects at all, and the code path is tolerant of both forms.
 *  2. As one big generation it truncates and rushes: 8 words per scene instead
 *     of 40. So the plan is one call and each scene's wording is its own call,
 *     which always fits in `num_predict`.
 *  3. `format: "json"` makes the grammar fight the model when the schema is
 *     loose. Planning runs without it and is parsed leniently instead.
 *
 * Everything the model returns is validated with the same zod schema the editor
 * uses, so a bad draft is caught here rather than at render time.
 */

export type WriteBrief = {
  notes: string;
  topic?: string;
  audience?: string;
  targetMinutes?: number;
  style?: string;
  language?: string;
  /** Speak with this many voices, each scene labelled. */
  voices?: number;
  partOf?: { index: number; total: number };
  technical?: boolean;
  /** "fast" keeps the plan short; "careful" allows longer scenes. */
  effort?: "fast" | "careful";
};

export type WriteProgress = {
  stage: string;
  /** 0..1 over the whole job, when knowable. */
  progress: number;
  /** Live text from the model, for the log pane. */
  stream?: string;
};

export type WriteResult = {
  name: string;
  scenes: SceneSpec[];
  yaml: string;
  voice: string;
  model: string;
  seconds: number;
  via: "model" | "partial" | "fallback";
  notes: string[];
  speed: Speed | null;
};

export type WriteHooks = {
  onProgress?: (p: WriteProgress) => void;
  /** Return true to stop the job. */
  cancelled?: () => boolean;
};

const WORDS_PER_MINUTE = 150;
const SCENE_WORDS = 40;

/* --------------------------------------------------------------- planning */

const SLOT_MENU = `
- title       | say: HEADLINE           | sub: OPTIONAL SECOND LINE
- bullets     | say: one item; another item; a third
- cards       | say: TERM=short value; TERM2=short value
- steps       | say: first step; second step; third step
- stack       | say: bottom layer; middle layer; top layer   (optional 4th field: the number of the layer to highlight, starting at 0)
- compare     | say: LEFT TITLE|left point|left point; RIGHT TITLE|right point|right point
- mnemonic    | say: THE PHRASE; X; Y; Z        (first item is the phrase, the rest are one letter each)
- code        | say: first line of code; second line
- keypoints   | say: the takeaway; another takeaway      (a short recap list)
- callout     | say: kind|TITLE|the sentence           (kind is note, tip, warning, danger or key)
- quote       | say: the quoted line|who said it
- timeline    | say: 1912: what happened; 1934: what happened next
- table       | say: Column A|Column B; row value|row value; another|another
- diagram     | say: Start -> Middle -> End             (an arrow between two names draws an edge)
- chapter     | say: CHAPTER 1; The Title Of The Chapter
- stat        | say: LABEL=42; ANOTHER=87              (numbers that deserve to be big)
- outro       | say: CLOSING LINE        | sub: OPTIONAL SECOND LINE`.trim();

function planSystem(brief: WriteBrief): string {
  const words = Math.round((brief.targetMinutes ?? 3) * WORDS_PER_MINUTE);
  const scenes = Math.max(3, Math.min(16, Math.round(words / SCENE_WORDS)));
  const voiceList = VOICES.slice(0, Math.max(1, Math.min(brief.voices ?? 1, VOICES.length)))
    .map((v) => `${v.id} (${v.label}, ${v.lang})`)
    .join("; ");

  const parts = [
    "You are an expert explainer-video planner.",
    `Break the notes into exactly ${scenes} scenes so the narration totals about ${words} words.`,
    "",
    "Return ONE JSON object, nothing else. Use this exact flat shape:",
    "{",
    `  "name": "video title",`,
    `  "scenes": [`,
    `    {`,
    `      "title": "scene title, at most 5 words",`,
    `      "summary": "one sentence saying what this scene must teach",`,
    brief.voices && brief.voices > 1 ? `      "voice": "one of: ${voiceList.split("; ").map((v) => v.split(" ")[0]).join(" or ")}",` : "",
    `      "slots": [`,
    `        { "type": "title", "say": "SHORT HEADLINE", "sub": "optional second line" },`,
    `        { "type": "bullets", "say": "about four words; another four words; a third" }`,
    `      ]`,
    `    }`,
    `  ]`,
    "}",
    "",
    "Rules:",
    "- `say` is a single string. Use semicolons to separate items. NEVER use nested objects or arrays.",
    "- Every scene's FIRST slot is type `title`. The headline must be at most 5 words.",
    "- MOST scenes get a second slot that is not `title`. Use bullets for lists, steps for a process, compare for two sides, cards for terms, mnemonic for a memorable phrase, stack for layers, code for code.",
    "- Keep every on-screen string to 2 to 5 words. Never put a full sentence on screen.",
    "- Do not repeat the summary on screen. The screen shows the shape of the idea; the voice explains it.",
    "- The LAST scene's last slot is type `outro`.",
    "- The scenes together must cover the notes in a sensible teaching order.",
    "",
    "Slot menu:",
    SLOT_MENU,
  ];

  if (brief.voices && brief.voices > 1) {
    parts.push(
      "",
      `Give every scene a "voice" field from: ${voiceList}.`,
      "Alternate speakers so the lesson is a conversation. Never give two scenes in a row to the same voice.",
    );
  }
  if (brief.technical) {
    parts.push("", "This is technical material: use a `code` slot wherever the notes mention code, a command or a formula.");
  }
  if (brief.partOf && brief.partOf.total > 1) {
    parts.push(
      "",
      `This is part ${brief.partOf.index} of ${brief.partOf.total} of a series. Open by orienting the viewer briefly, close by pointing at the next part. Do not re-teach earlier parts.`,
    );
  }
  if (brief.style) parts.push("", `Tone: ${brief.style}.`);
  parts.push("", "Reply with the JSON object only.");
  return parts.filter((l) => l !== "").join("\n");
}

/* ----------------------------------------------------------- slot parsing */

/** Split a `say` string into items, accepting both ";" and newlines. */
function sayItems(say: string, limit = 8): string[] {
  return say
    .split(/\s*;\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * A model that was told "do not use nested objects" sometimes writes the literal
 * word `None`, `null`, or `n/a` where it means "no value". Treat those as absent
 * rather than putting "None" on screen.
 */
export function cleanField(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  if (/^(none|null|nil|n\/?a|undefined|-|—|""|'')$/i.test(text)) return undefined;
  // Strip stray quotes the model added around a short value, then repair the
  // same punctuation damage narration gets.
  const unquoted = normalisePunctuation(text.replace(/^["'](.*)["']$/, "$1").trim());
  return unquoted || undefined;
}

type RawSlot = { type?: unknown; say?: unknown; sub?: unknown; heading?: unknown };

/**
 * Turn one planned slot into a real block. Returns null for a slot we cannot
 * salvage, which is normal - the plan is a draft, not a contract.
 */
export function slotToBlock(slot: RawSlot): Block | null {
  const type = String(slot.type ?? "").trim().toLowerCase();

  // A model that ignores instructions and returns a proper block object still
  // works: fall through to the items/heading fields it filled in.
  const raw = slot as Record<string, unknown>;
  const fallbackItems = (): string[] => {
    const items = raw.items;
    if (Array.isArray(items)) {
      return items
        .map((i) => {
          if (typeof i === "string") return i.trim();
          const o = i as { label?: unknown; text?: unknown };
          return String(o.label ?? o.text ?? "").trim();
        })
        .filter(Boolean)
        .slice(0, 8);
    }
    return [];
  };

  const say = typeof slot.say === "string" ? slot.say : "";
  const items = sayItems(say).length ? sayItems(say) : fallbackItems();
  const heading = cleanField(slot.heading);
  const sub = cleanField(slot.sub);

  switch (type) {
    case "title":
    case "outro": {
      const text = cleanField(items[0]) ?? cleanField(say);
      if (!text) return null;
      return type === "title" ? { type: "title", text, sub } : { type: "outro", text, sub };
    }
    case "chapter": {
      // The number, when present, is the first item; the title is the rest.
      const first = cleanField(items[0]);
      if (!first) return null;
      const looksLikeNumber = /^(chapter|part|section|\d+)\b/i.test(first) && items.length > 1;
      return {
        type: "chapter",
        number: looksLikeNumber ? first : undefined,
        title: looksLikeNumber ? cleanField(items[1]) ?? first : first,
        sub,
      };
    }
    case "bullets":
    case "steps":
    case "keypoints": {
      const list = items.map((i) => cleanField(i)).filter((i): i is string => Boolean(i)).slice(0, 6);
      if (!list.length) return null;
      return { type, heading, items: list };
    }
    case "cards":
    case "stat": {
      const list = items
        .map((item) => {
          const [label, ...rest] = item.split("=");
          const value = rest.join("=").trim();
          const l = cleanField(label.replace(/[:.]$/, ""));
          if (!l) return null;
          return { label: l, value: cleanField(value) };
        })
        .filter((c): c is { label: string; value: string | undefined } => c !== null)
        .slice(0, 6);
      if (!list.length) return null;
      return type === "cards" ? { type: "cards", heading, items: list } : { type: "stat", heading, items: list };
    }
    case "callout": {
      // "kind|TITLE|the text" - be forgiving about which parts are present.
      const parts = (say.includes("|") ? sayItems(say, 4) : []).map((p) => cleanField(p));
      const hasKind = parts.length > 1 && /^(note|tip|warning|danger|key)$/i.test(parts[0] ?? "");
      const kind = (hasKind ? (parts[0]!.toLowerCase() as "note") : undefined) ?? undefined;
      const title = hasKind ? parts[1] : parts[0];
      const text = (hasKind ? parts[2] : parts[1]) ?? cleanField(say);
      if (!text) return null;
      return { type: "callout", kind, title: title ?? undefined, text };
    }
    case "quote": {
      // "the quoted line|who said it"
      const [quoteText, ...rest] = (say.includes("|") ? say.split("|") : items).map((p) => cleanField(p));
      const text = quoteText ?? cleanField(say);
      if (!text) return null;
      return { type: "quote", text, who: rest.filter(Boolean)[0] };
    }
    case "timeline": {
      // "when: what; when: what" - the time is before the colon.
      const entries = sayItems(say, 8)
        .map((item) => {
          const m = /^([^:]{1,24}):\s*(.+)$/.exec(item);
          if (m) return { when: cleanField(m[1]) ?? "", what: cleanField(m[2]) ?? "" };
          return { when: "", what: cleanField(item) ?? "" };
        })
        .filter((e) => e.what)
        .map((e, i) => ({ when: e.when || `Step ${i + 1}`, what: e.what }));
      if (!entries.length) return null;
      return { type: "timeline", heading, entries };
    }
    case "table": {
      // "H1|H2|H3; a|b|c; d|e|f" - first row is the header.
      const rows = sayItems(say, 9).map((r) => r.split("|").map((c) => cleanField(c) ?? ""));
      if (rows.length < 2) return null;
      const columns = rows[0];
      const body = rows.slice(1).map((r) => columns.map((_, i) => r[i] ?? ""));
      return { type: "table", heading, data: { columns, rows: body } };
    }
    case "diagram": {
      // "A -> B; B -> C" with inline node colours forgotten; nodes are inferred.
      const parts = sayItems(say, 10);
      const nodes: { id: string; label: string }[] = [];
      const edges: { from: string; to: string }[] = [];
      const idOf = (label: string) => {
        const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "n";
        if (!nodes.some((n) => n.id === key)) nodes.push({ id: key, label });
        return key;
      };
      for (const part of parts) {
        const edge = /^(.+?)\s*(?:->|=>|→|to)\s*(.+)$/i.exec(part);
        if (edge) {
          const from = cleanField(edge[1]);
          const to = cleanField(edge[2]);
          if (from && to) edges.push({ from: idOf(from), to: idOf(to) });
          continue;
        }
        const label = cleanField(part);
        if (label) idOf(label);
      }
      if (nodes.length < 2) return null;
      return { type: "diagram", heading, nodes, edges: edges.length ? edges : undefined };
    }
    case "stack": {
      // The highlight arrives either as a separate field or as a trailing item.
      const list = items.map((label) => ({ label })).filter((l) => cleanField(l.label));
      if (!list.length) return null;
      const raw = Number((slot as Record<string, unknown>).highlight);
      const highlight = Number.isInteger(raw) && raw >= 0 && raw < list.length ? raw : undefined;
      return { type: "stack", heading, layers: list.slice(0, 8), highlight };
    }
    case "compare": {
      const [leftTitle, ...rest] = items;
      // "LEFT A|b|c; RIGHT D|e" - items arrive already split on ";", so gather
      // everything that belongs to the left side until one starts with a "|".
      const left: string[] = [];
      const right: string[] = [];
      let side = 0;
      const parts = sayItems(say, 20);
      const first = parts.shift() ?? leftTitle ?? "";
      const [firstTitle, ...firstItems] = first.split("|").map((p) => p.trim());
      const workingLeft = [firstTitle, ...firstItems];
      if (rest.length || parts.length) {
        left.push(...workingLeft.slice(1));
      }
      let rightTitle = "Other";
      for (const part of parts) {
        const bits = part.split("|").map((p) => p.trim());
        if (side === 0 && bits.length > 1 && right.length === 0) {
          // Second side starts once a segment carries its own header.
          side = 1;
          rightTitle = bits[0] || rightTitle;
          right.push(...bits.slice(1));
          continue;
        }
        (side === 0 ? left : right).push(...(bits.length > 1 ? bits.slice(1) : bits));
      }
      const leftItems = left.filter(Boolean).slice(0, 5);
      const rightItems = right.filter(Boolean).slice(0, 5);
      if (!leftItems.length && !rightItems.length) return null;
      return {
        type: "compare",
        heading,
        left: { title: cleanField(workingLeft[0]) || "One", items: leftItems.length ? leftItems : ["—"] },
        right: { title: cleanField(rightTitle) || "Other", items: rightItems.length ? rightItems : ["—"] },
      };
    }
    case "mnemonic": {
      const [phrase, ...letters] = items;
      if (!phrase) return null;
      const expansion = letters.length ? letters : phrase.split("").filter((c) => c.trim());
      return { type: "mnemonic", phrase: phrase.toUpperCase(), expansion };
    }
    case "code": {
      const code = items.join("\n");
      if (!code) return null;
      return { type: "code", heading, language: undefined, code };
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------- validation */

type RawScene = { title?: unknown; summary?: unknown; voice?: unknown; slots?: unknown };

type Plan = { name?: unknown; scenes?: unknown };

export function planFromModel(raw: unknown, brief: WriteBrief): {
  name: string;
  scenes: { title: string; summary: string; voice?: string; blocks: Block[] }[];
  problems: string[];
} {
  const doc = (raw ?? {}) as Plan;
  const problems: string[] = [];
  const rawScenes = Array.isArray(doc.scenes) ? (doc.scenes as RawScene[]) : [];
  if (!rawScenes.length) problems.push("no scenes array");

  const allowVoices = Math.max(1, Math.min(brief.voices ?? 1, VOICES.length));
  const voiceIds = VOICES.slice(0, allowVoices).map((v) => v.id);

  const scenes = rawScenes.flatMap((s, i) => {
    const title = String(s?.title ?? "").trim() || `Scene ${i + 1}`;
    const summary = String(s?.summary ?? "").trim();
    const rawSlots = Array.isArray(s?.slots) ? (s.slots as RawSlot[]) : [];
    let blocks = rawSlots.map(slotToBlock).filter((b): b is Block => b !== null);

    if (!blocks.some((b) => b.type === "title")) {
      blocks = [{ type: "title", text: title.slice(0, 60) }, ...blocks];
    }
    if (blocks.length < 2) problems.push(`scene ${i + 1} had no usable second block`);

    const asked = String(s?.voice ?? "").trim();
    const voice = voiceIds.includes(asked) ? asked : voiceIds[i % voiceIds.length];

    if (!summary) problems.push(`scene ${i + 1} had no summary`);
    return [{ title: title.slice(0, 60), summary, voice: allowVoices > 1 ? voice : undefined, blocks }];
  });

  return { name: String(doc.name ?? "").trim(), scenes, problems };
}

/* --------------------------------------------------------- scene wording */

function narrationSystem(brief: WriteBrief, speaker?: string): string {
  const parts = [
    "You write the spoken narration for ONE scene of an explainer video.",
    `Write ${SCENE_WORDS} to ${SCENE_WORDS + 20} words.`,
    "Plain spoken sentences only. No headings, no bullet points, no markdown, no stage directions.",
    "Never write a speaker name or a label at the start - no `Amy:`, no `Narrator:`. Start straight into the sentence.",
    `Write in ${brief.language || "English"}.`,
  ];
  if (speaker) {
    parts.push(
      `You are writing the lines for the speaker called ${speaker}. Keep their voice consistent - this is one of several speakers in a conversation.`,
    );
  }
  if (brief.audience) parts.push(`The audience is ${brief.audience}.`);
  if (brief.style) parts.push(`Tone: ${brief.style}.`);
  parts.push(
    "",
    "Do not describe the visuals and do not read the on-screen words aloud. Explain the idea properly, with a concrete detail or example where the notes offer one.",
    "Reply with the narration text only. No quotes, no preamble.",
  );
  return parts.join("\n");
}

function narrationPrompt(
  brief: WriteBrief,
  scene: { title: string; summary: string; blocks: Block[] },
  index: number,
  total: number,
): string {
  const onScreen = scene.blocks
    .map((b) => {
      if (b.type === "title" || b.type === "outro") return `${b.type}: ${b.text}`;
      if (b.type === "bullets" || b.type === "steps" || b.type === "keypoints") return `${b.type}: ${b.items.join(" / ")}`;
      if (b.type === "cards" || b.type === "stat") return `${b.type}: ${b.items.map((c) => c.label).join(" / ")}`;
      if (b.type === "stack") return `stack: ${b.layers.map((l) => l.label).join(" / ")}`;
      if (b.type === "compare") return `compare: ${b.left.title} vs ${b.right.title}`;
      if (b.type === "mnemonic") return `mnemonic: ${b.phrase}`;
      if (b.type === "code") return `code: ${b.code.replace(/\n/g, " ")}`;
      if (b.type === "callout") return `callout: ${b.title ?? b.kind ?? "note"} - ${b.text}`;
      if (b.type === "quote") return `quote: ${b.text}${b.who ? ` (${b.who})` : ""}`;
      if (b.type === "timeline") return `timeline: ${b.entries.map((e) => `${e.when} ${e.what}`).join(" / ")}`;
      if (b.type === "table") return `table: ${b.data.columns.join(" | ")}`;
      if (b.type === "diagram") return `diagram: ${b.nodes.map((n) => n.label).join(" -> ")}`;
      if (b.type === "chapter") return `chapter: ${b.number ? `${b.number} ` : ""}${b.title}`;
      return "";
    })
    .filter(Boolean)
    .join("\n");

  const notes = brief.notes.length > 4000 ? `${brief.notes.slice(0, 4000)}\n[...notes continue...]` : brief.notes;
  return [
    `Scene ${index + 1} of ${total}: "${scene.title}"`,
    `What this scene must teach: ${scene.summary}`,
    "",
    "What is on screen (do NOT read this aloud):",
    onScreen,
    "",
    "The notes this video is based on:",
    "-----",
    notes,
    "-----",
    "",
    `Now write the ${SCENE_WORDS}-word narration for this scene.`,
  ].join("\n");
}

/**
 * Fix the punctuation a model emits that a voice or a caption cannot use.
 *
 * Three things go wrong in practice: a literal em dash appears in narration
 * (Piper reads it as nothing useful, and it looks wrong in a caption), the
 * model emits mojibake like "�??" when a smart quote trips its encoder, and
 * curly quotes and ellipses confuse the caption splitter.
 */
function normalisePunctuation(text: string): string {
  return text
    // Mojibake first. A UTF-8 em dash / curly quote decoded as latin-1 arrives as
    // "â€" followed by a byte, and models often tack on stray "?" characters.
    .replace(/\uFFFD\?*/g, " ")
    .replace(/\u00e2\u20ac[\u0093\u0094\u009d\u009c\u2013\u2014\u201d\u201c]/g, ", ")
    .replace(/\u00e2\u20ac\u00a6/g, ", ")
    .replace(/â€[^\s]*/g, ", ")
    // Dashes used as *punctuation* become a natural spoken pause. Only a dash
    // surrounded by spaces counts: "state-of-the-art" must survive intact, and a
    // colon is a table cell separator, not a pause.
    .replace(/\s+[—–]\s+/g, ", ")
    // Ellipsis, written either way.
    .replace(/\s*\.{3,}\s*/g, ", ")
    .replace(/\s*\u2026\s*/g, ", ")
    // Curly quotes become straight ones so the quote-stripping below still works.
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Collapse the punctuation we may have just doubled up.
    .replace(/,\s*,/g, ",")
    .replace(/\s+([,.!?;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Models sometimes wrap the narration in quotes or add a preamble. */
export function cleanNarration(raw: string, speaker?: string): string {
  let text = normalisePunctuation(raw.trim());
  const fence = /```[a-z]*\s*([\s\S]*?)```/i.exec(text);
  if (fence) text = fence[1].trim();
  text = text.replace(/^(narration|scene\s*\d+)\s*[:\-]\s*/i, "").trim();
  // Models like to prefix the line with the speaker's name ("Amy: ..."). The
  // name is already on screen as a tag, so drop it from the spoken text.
  const names = speaker ? [speaker, ...(VOICES.map((v) => v.label))] : VOICES.map((v) => v.label);
  const escaped = [...new Set(names)].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  text = text.replace(new RegExp(`^\\s*(?:${escaped})\\s*[:\\-—]\\s*`, "i"), "").trim();
  // The model also sometimes wraps each line as "Name: line" or quotes the lot.
  text = text.replace(new RegExp(`(^|\\n)\\s*(?:${escaped})\\s*[:\\-—]\\s*`, "gi"), "$1").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return normalisePunctuation(text.replace(/\s+/g, " ").trim());
}

/* ------------------------------------------------------------ the writer */

export async function writeScript(
  brief: WriteBrief,
  model: string | undefined,
  hooks: WriteHooks = {},
): Promise<WriteResult> {
  const notes = brief.notes.trim();
  if (!notes) throw new Error("there are no notes to write from");

  const log: string[] = [];
  const emit = (stage: string, progress: number, stream?: string) =>
    hooks.onProgress?.({ stage, progress, stream });
  const stop = () => hooks.cancelled?.() === true;

  const targetScenes = Math.max(
    3,
    Math.min(16, Math.round(((brief.targetMinutes ?? 3) * WORDS_PER_MINUTE) / SCENE_WORDS)),
  );

  /* 1 - plan ------------------------------------------------------------- */

  emit("planning the scenes", 0.02);
  const planGen = await generate({
    model,
    system: planSystem(brief),
    prompt: [
      brief.topic ? `Topic: ${brief.topic}` : "",
      brief.audience ? `Audience: ${brief.audience}` : "",
      `Target length: about ${brief.targetMinutes ?? 3} minutes, so exactly ${targetScenes} scenes.`,
      "",
      "Notes:",
      "-----",
      notes.length > 8000 ? `${notes.slice(0, 8000)}\n[...notes truncated...]` : notes,
      "-----",
      "",
      "Reply with the JSON object only.",
    ]
      .filter(Boolean)
      .join("\n"),
    // Deliberately NOT format:"json" - the grammar fights a loose schema and
    // the model falls back to positional arrays. Parsed leniently instead.
    temperature: 0.6,
    numCtx: 8192,
    numPredict: 256 + targetScenes * 130,
    onToken: (chunk) => emit("planning the scenes", 0.02, chunk),
  });

  if (stop()) throw new Error("cancelled");

  const { extractJson } = await import("./ollama");
  let plan = planFromModel(extractJson(planGen.text), brief);
  log.push(`planned ${plan.scenes.length} scenes in ${formatDuration(planGen.seconds)}`);

  if (plan.scenes.length < 2) {
    log.push("the plan was unusable, trying once more");
    emit("the plan was unusable - asking again", 0.04);
    const retry = await generate({
      model,
      system: planSystem(brief),
      prompt: `Your previous reply was not usable as a plan. Reply with the JSON object only, using the flat "scenes" -> "slots" shape.\n\nNotes:\n${notes.slice(0, 6000)}`,
      temperature: 0.4,
      numCtx: 8192,
      numPredict: 256 + targetScenes * 130,
      onToken: (chunk) => emit("re-planning", 0.04, chunk),
    });
    plan = planFromModel(extractJson(retry.text), brief);
    log.push(`re-planned: ${plan.scenes.length} scenes`);
  }

  if (stop()) throw new Error("cancelled");

  if (plan.scenes.length < 2) {
    log.push("the model could not produce a usable plan - structuring the notes directly");
    emit("structuring the notes directly", 0.6);
    const { proseToScenes } = await import("./script");
    const scenes = proseToScenes(notes);
    if (!scenes.length) throw new Error("could not turn those notes into scenes");
    const name = brief.topic?.trim() || scenes[0].title;
    const yaml = toScriptYaml({ name, theme: { name: "midnight" }, voice: DEFAULT_VOICE_ID, scenes });
    return {
      name,
      scenes,
      yaml,
      voice: DEFAULT_VOICE_ID,
      model: planGen.model,
      seconds: planGen.seconds,
      via: "fallback",
      notes: [...log, "used the built-in splitter - press Write again for a model version"],
      speed: cachedSpeed(planGen.model),
    };
  }

  /* 2 - wording, one scene per call -------------------------------------- */

  // A per-scene call is slower per scene but never truncates, and it keeps
  // each request inside the context window on a small machine.
  const perScene = planGen.seconds / Math.max(1, plan.scenes.length);
  const sceneCount = plan.scenes.length;
  const scenes: SceneSpec[] = [];
  const failures: number[] = [];

  for (let i = 0; i < sceneCount; i++) {
    if (stop()) throw new Error("cancelled");
    const planned = plan.scenes[i];
    const base = 0.08 + (i / sceneCount) * 0.88;
    emit(`writing scene ${i + 1} of ${sceneCount}`, base);

    let narration = "";
    try {
      const gen = await generate({
        model,
        system: narrationSystem(brief, planned.voice ? voiceLabel(planned.voice) : undefined),
        prompt: narrationPrompt(brief, planned, i, sceneCount),
        temperature: 0.75,
        numCtx: 4096,
        numPredict: 320,
        onToken: (chunk) => emit(`writing scene ${i + 1} of ${sceneCount}`, base, chunk),
      });
      narration = cleanNarration(gen.text, planned.voice ? voiceLabel(planned.voice) : undefined);
    } catch (err) {
      if (stop()) throw new Error("cancelled");
      log.push(`scene ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (narration.split(/\s+/).filter(Boolean).length < 12) {
      // Too short to be useful: fall back to the summary so the scene still
      // says something sensible, and note it so the user knows to edit.
      failures.push(i + 1);
      narration = planned.summary || planned.title;
      log.push(`scene ${i + 1} fell back to its one-line summary - worth editing`);
    }

    scenes.push({
      id: i + 1,
      slug: planned.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32) || `scene-${String(i + 1).padStart(2, "0")}`,
      title: planned.title,
      narration,
      voice: planned.voice,
      blocks: planned.blocks,
    });
  }

  if (!scenes.length) throw new Error("the model produced no usable scenes");

  /* 3 - serialise and validate ------------------------------------------- */

  const name = plan.name || brief.topic?.trim() || scenes[0].title;
  const yaml = toScriptYaml({ name, theme: { name: "midnight" }, voice: DEFAULT_VOICE_ID, scenes });
  const reparsed = parseScript(yaml);
  if (!reparsed.ok) throw new Error(`the written script did not validate: ${reparsed.errors.join("; ")}`);

  const words = scenes.reduce((n, s) => n + s.narration.split(/\s+/).filter(Boolean).length, 0);
  const totalSeconds = planGen.seconds + scenes.length * perScene;
  log.push(`${scenes.length} scenes, ${words} words (about ${(words / WORDS_PER_MINUTE).toFixed(1)} min)`);
  if (failures.length) log.push(`scenes needing your attention: ${failures.join(", ")}`);
  if (brief.voices && brief.voices > 1) {
    const used = [...new Set(scenes.map((s) => s.voice))].filter(Boolean) as string[];
    log.push(`speakers: ${used.map(voiceLabel).join(", ") || "none assigned"}`);
  }

  // Remember how fast this model actually is, so the next run can warn.
  if (planGen.evalCount > 20 && planGen.seconds > 0) {
    const tps = planGen.evalCount / Math.max(1, planGen.seconds - planGen.firstTokenSeconds);
    rememberSpeed({
      model: planGen.model,
      tokensPerSecond: Number(tps.toFixed(2)),
      firstTokenSeconds: Number(planGen.firstTokenSeconds.toFixed(1)),
      measuredAt: new Date().toISOString(),
    });
  }

  emit("done", 1);
  return {
    name,
    scenes: reparsed.scenes,
    yaml,
    voice: DEFAULT_VOICE_ID,
    model: planGen.model,
    seconds: totalSeconds,
    via: failures.length ? "partial" : "model",
    notes: log,
    speed: cachedSpeed(planGen.model),
  };
}

/** Rough estimate the UI shows before the user commits to a long wait. */
export function estimateWrite(notes: string, brief: WriteBrief, model: string | null): string {
  if (!model) return "no model installed";
  const scenes = Math.max(
    3,
    Math.min(16, Math.round(((brief.targetMinutes ?? 3) * WORDS_PER_MINUTE) / SCENE_WORDS)),
  );
  const speed = cachedSpeed(model);
  if (!speed) {
    const chars = notes.trim().length;
    return `first run - ${chars > 4000 ? "this may take 20-40 minutes" : "this may take 10-25 minutes"}`;
  }
  return `about ${formatDuration(estimateSeconds(speed, scenes) * 1.6)} on this machine (${speed.tokensPerSecond.toFixed(1)} tok/s)`;
}
