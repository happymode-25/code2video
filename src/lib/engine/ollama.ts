import { paths } from "./paths";
import { PREFERRED_WRITER_MODELS, pickWriterModel } from "./models";

/**
 * A thin client for the local Ollama daemon.
 *
 * Everything here is plain fetch: no SDK, no API key, and the notes never
 * leave the machine. The writer asks for JSON and then validates it with the
 * same zod schema the editor uses, so a hallucinated block type is caught
 * before it ever reaches a project.
 */

export type OllamaStatus = {
  reachable: boolean;
  models: string[];
  /** The model the writer would use. */
  writer: string | null;
  error?: string;
};

export async function ollamaStatus(timeoutMs = 4000): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${paths.ollama}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return { reachable: false, models: [], writer: null, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name).sort();
    return { reachable: true, models, writer: pickWriterModel(models) };
  } catch (err) {
    return {
      reachable: false,
      models: [],
      writer: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type GenerateOptions = {
  model?: string;
  system: string;
  prompt: string;
  /** Ask for a JSON object; Ollama then constrains sampling to valid JSON. */
  json?: boolean;
  temperature?: number;
  /** Long scripts need a big window. */
  numCtx?: number;
  /** Cap on generated tokens. */
  numPredict?: number;
  /** Threads for the CPU runner; omit to let Ollama decide. */
  numThread?: number;
  signal?: AbortSignal;
  onToken?: (chunk: string) => void;
};

export type GenerateResult = {
  text: string;
  model: string;
  /** Seconds spent generating, from Ollama's own counters. */
  seconds: number;
  tokens: number;
  /** Seconds until the first token arrived - prompt processing on a CPU. */
  firstTokenSeconds: number;
  evalCount: number;
  promptEvalCount: number;
};

/** One-shot generation. Streams so the UI can show life while it thinks. */
export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const status = await ollamaStatus();
  if (!status.reachable) {
    throw new Error(
      `Ollama is not reachable at ${paths.ollama}. Start it with "ollama serve", then try again.`,
    );
  }
  const model = opts.model && status.models.includes(opts.model) ? opts.model : status.writer;
  if (!model) {
    throw new Error(
      `No usable Ollama model. Install one with "ollama pull ${PREFERRED_WRITER_MODELS[0]}".`,
    );
  }

  const started = Date.now();
  const res = await fetch(`${paths.ollama}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Prompt processing on a CPU can take minutes for a long system prompt,
    // so keep the socket open generously. Streaming means we can tell the
    // difference between "thinking" and "stuck".
    signal: opts.signal ?? AbortSignal.timeout(45 * 60 * 1000),
    body: JSON.stringify({
      model,
      system: opts.system,
      prompt: opts.prompt,
      stream: true,
      // Thinking models would otherwise spend the whole budget reasoning.
      think: false,
      format: opts.json ? "json" : undefined,
      keep_alive: "10m",
      options: {
        temperature: opts.temperature ?? 0.7,
        num_ctx: opts.numCtx ?? 8192,
        // Scripts are long; do not cut them off mid-sentence.
        num_predict: opts.numPredict ?? 4096,
        // One request at a time: this is a 4-core laptop, not a server.
        num_thread: opts.numThread,
      },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${detail.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let tokens = 0;
  let firstTokenSeconds = 0;
  let evalCount = 0;
  let promptEvalCount = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let chunk: {
        response?: string;
        done?: boolean;
        eval_count?: number;
        prompt_eval_count?: number;
        error?: string;
      };
      try {
        chunk = JSON.parse(trimmed) as typeof chunk;
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
      if (chunk.response) {
        if (!firstTokenSeconds) firstTokenSeconds = (Date.now() - started) / 1000;
        text += chunk.response;
        tokens += 1;
        opts.onToken?.(chunk.response);
      }
      if (chunk.done) {
        evalCount = chunk.eval_count ?? tokens;
        promptEvalCount = chunk.prompt_eval_count ?? 0;
        break;
      }
    }
  }

  return {
    text: text.trim(),
    model,
    seconds: (Date.now() - started) / 1000,
    tokens,
    firstTokenSeconds,
    evalCount,
    promptEvalCount,
  };
}

/**
 * Pull the first JSON object or array out of a model response. Small models
 * like to wrap JSON in prose or a ```json fence even when told not to.
 */
export function extractJson<T = unknown>(raw: string): T {
  const text = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();

  const tryParse = (s: string): T | undefined => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(candidate);
  if (direct !== undefined) return direct;

  // Fall back to the outermost {...} or [...] in the text.
  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const start = candidate.indexOf(open);
    const end = candidate.lastIndexOf(close);
    if (start >= 0 && end > start) {
      const sliced = tryParse(candidate.slice(start, end + 1));
      if (sliced !== undefined) return sliced;
    }
  }
  throw new Error(`the model did not return JSON. It said:\n${text.slice(0, 500)}`);
}
