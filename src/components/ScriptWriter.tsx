"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Field, Tag } from "@/components/ui";

/**
 * The "write it for me" panel: paste notes or drop in a PDF, and a local model
 * turns them into a script that lands in the editor.
 *
 * Writing runs on the machine's own CPU, so it can take minutes. The panel
 * says so up front and keeps the browser's own spinner off the critical path:
 * the fetch is a normal await, and the writing happens server-side.
 */

type OllamaStatus = {
  reachable: boolean;
  models: string[];
  writer: string | null;
  error?: string;
};

type PdfResult = {
  name: string;
  chars: number;
  pageCount: number;
  pagesWithText: number;
  truncated: boolean;
  text: string;
  error?: string;
};

type WriteResponse = {
  name: string;
  yaml: string;
  scenes: number;
  model: string;
  seconds: number;
  via: "model" | "partial" | "fallback";
  notes: string[];
  error?: string;
};

export function ScriptWriter({
  onApply,
  disabled,
}: {
  /** Called with the written YAML once the model is done. */
  onApply: (yaml: string, name: string) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [minutes, setMinutes] = useState(3);
  const [voices, setVoices] = useState(1);
  const [style, setStyle] = useState("");
  const [model, setModel] = useState("");
  const [pdf, setPdf] = useState<PdfResult | null>(null);
  const [reading, setReading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [phase, setPhase] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/write", { cache: "no-store" })
      .then((r) => r.json() as Promise<OllamaStatus>)
      .then((s) => {
        setStatus(s);
        if (s.writer) setModel(s.writer);
      })
      .catch(() => setStatus({ reachable: false, models: [], writer: null, error: "could not reach the app" }));
  }, []);

  // A ticking clock: writing on a laptop CPU is measured in minutes, so the
  // user needs to see that it is moving even when there is nothing to stream.
  // The interval lives here rather than in an effect that resets state.
  const clockRef = useRef<number | null>(null);
  const startClock = useCallback(() => {
    setElapsed(0);
    if (clockRef.current) window.clearInterval(clockRef.current);
    clockRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);
  const stopClock = useCallback(() => {
    if (clockRef.current) window.clearInterval(clockRef.current);
    clockRef.current = null;
  }, []);
  useEffect(() => stopClock, [stopClock]);

  const uploadPdf = useCallback(async (file: File) => {
    setReading(true);
    setError(null);
    setLog([]);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/pdf", { method: "POST", body });
      const data = (await res.json()) as PdfResult;
      if (!res.ok) {
        setError(data.error ?? "could not read that PDF");
        return;
      }
      setPdf(data);
      setNotes(data.text);
      if (!topic) setTopic(data.name.replace(/[-_]+/g, " ").slice(0, 60));
      setLog([
        `read ${data.name}: ${data.pageCount} page(s), ${data.chars.toLocaleString()} characters`,
        data.truncated ? "the notes were long, so the tail was trimmed for the model" : "full text is in the box below",
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(false);
    }
  }, [topic]);

  const write = useCallback(async () => {
    if (!notes.trim()) {
      setError("paste some notes, or upload a PDF, first");
      return;
    }
    setWriting(true);
    setError(null);
    startClock();
    setLog((l) => [...l, `asking ${model || "the model"} to write the script…`]);
    setPhase("planning");
    // Stream a coarse progress guess so the bar is not frozen for ten minutes.
    const tick = window.setInterval(() => {
      setPhase((p) => (p === "planning" ? "writing scenes" : p));
    }, 45_000);
    try {
      const res = await fetch("/api/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notes,
          topic,
          audience,
          targetMinutes: minutes,
          voices,
          style,
          technical: true,
          model: model || undefined,
        }),
      });
      const data = (await res.json()) as WriteResponse;
      if (!res.ok) {
        setError(data.error ?? "writing failed");
        setLog((l) => [...l, `failed: ${data.error ?? res.status}`]);
        return;
      }
      setLog((l) => [...l, ...data.notes.map((n) => `· ${n}`)]);
      setLog((l) => [...l, `done in ${Math.round(data.seconds)}s via ${data.via}`]);
      onApply(data.yaml, data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      window.clearInterval(tick);
      stopClock();
      setWriting(false);
      setPhase("");
    }
  }, [notes, topic, audience, minutes, voices, style, model, onApply, startClock, stopClock]);

  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const unreachable = status !== null && !status.reachable;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Write with AI</span>
        <div className="flex items-center gap-2">
          {status === null ? (
            <Tag color="#8FA0C8">checking…</Tag>
          ) : unreachable ? (
            <Tag color="#E74C3C">ollama offline</Tag>
          ) : (
            <Tag color="#2ECC71">{status.models.length} model(s)</Tag>
          )}
        </div>
      </div>

      {unreachable && (
        <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-[11px] text-yellow-100">
          Ollama is not answering{status?.error ? ` (${status.error})` : ""}. Start it with{" "}
          <code className="rounded bg-black/30 px-1">ollama serve</code>, then reload. Writing uses your own machine, so
          the notes never leave it.
        </p>
      )}

      {!unreachable && status?.writer && (
        <p className="text-[11px] text-muted">
          Writing runs on this machine&apos;s CPU, so a 3-minute script takes roughly 10-25 minutes. You can keep
          editing the tabs below while it runs.
        </p>
      )}

      {/* PDF drop */}
      <label
        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2.5 text-xs transition ${
          reading ? "border-accent/60 bg-accent/10" : "border-line bg-panel2 hover:border-accent/50"
        }`}
      >
        <span className="text-ink">
          {reading ? "reading the PDF…" : pdf ? `📄 ${pdf.name}` : "📄 Upload a PDF of notes"}
        </span>
        <span className="text-muted">{pdf ? `${pdf.pageCount} page(s)` : "drag or click"}</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={reading || writing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadPdf(file);
            e.target.value = "";
          }}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <Field label="Topic">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Photosynthesis"
            className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none focus:border-accent/60"
          />
        </Field>
        <Field label="Audience">
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="GCSE students"
            className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none focus:border-accent/60"
          />
        </Field>
        <Field label="Minutes">
          <input
            type="number"
            min={1}
            max={12}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-20 rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none"
          />
        </Field>
        <Field label="Voices">
          <select
            value={voices}
            onChange={(e) => setVoices(Number(e.target.value))}
            className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none"
          >
            <option value={1}>1 narrator</option>
            <option value={2}>2 speakers</option>
            <option value={3}>3 speakers</option>
          </select>
        </Field>
        {status && status.models.length > 0 && (
          <Field label="Model">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none"
            >
              {status.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label="Tone (optional)">
        <input
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder="clear and friendly, a teacher talking to a class"
          className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none focus:border-accent/60"
        />
      </Field>

      <Field label="Notes" hint="This is what the model reads. A PDF fills it in automatically.">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paste lecture notes, a chapter, or rough bullet points…"
          className="h-40 w-full resize-y rounded-xl border border-line bg-[#070b18] p-3 text-xs text-ink outline-none focus:border-accent/60"
          spellCheck={false}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => void write()} disabled={writing || disabled || unreachable}>
          {writing ? `writing… ${mmss}` : "✍ Write script"}
        </Button>
        {notes.length > 0 && <span className="text-[11px] text-muted">{notes.length.toLocaleString()} characters</span>}
        {writing && <span className="text-[11px] text-accent">{phase}</span>}
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[11px] text-red-200">{error}</p>
      )}

      {log.length > 0 && (
        <pre className="max-h-32 overflow-auto rounded-xl border border-line bg-[#070b18] p-3 text-[11px] leading-relaxed text-[#b9c7e8]">
          {log.join("\n")}
        </pre>
      )}
    </Card>
  );
}
