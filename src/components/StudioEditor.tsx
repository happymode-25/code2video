"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Preview } from "@/components/Preview";
import { SceneInspector } from "@/components/SceneInspector";
import { ScriptWriter } from "@/components/ScriptWriter";
import { VoicePanel, type VoiceOption } from "@/components/VoicePanel";
import { Bar, Button, Card, Field, Tag, Toggle } from "@/components/ui";
import {
  parseScript,
  scenesToProse,
  toScriptYaml,
  themeFromDoc,
  proseToScenes,
  type ScriptDoc,
  type SerializableProject,
} from "@/lib/engine/script";
import { THEMES } from "@/lib/engine/themes";
import type { Job, Narration, RenderRecord, SceneSpec } from "@/lib/engine/types";
import type { StudioProps } from "@/remotion/Studio";
import { buildTimeline, filterNarration } from "@/lib/video/timeline";

type Props = {
  projectId: string;
  initialName: string;
  initialYaml: string;
  initialProse: string;
  narration: Narration | null;
  renders: RenderRecord[];
  voices: VoiceOption[];
};

function projectFromDoc(doc: ScriptDoc, scenes: SceneSpec[]): SerializableProject {
  return {
    name: doc.name,
    theme: themeFromDoc(doc),
    fps: doc.fps,
    width: doc.width,
    height: doc.height,
    gap: doc.gap,
    voice: doc.voice ?? "",
    cast: doc.cast as SerializableProject["cast"],
    captions: doc.captions,
    scenes,
  };
}

const fmtDuration = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const fmtBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function StudioEditor({
  projectId,
  initialName,
  initialYaml,
  initialProse,
  narration: initialNarration,
  renders: initialRenders,
  voices,
}: Props) {
  const [name, setName] = useState(initialName);
  const [yamlText, setYamlText] = useState(initialYaml);
  const [proseText, setProseText] = useState(initialProse);
  const [narration, setNarration] = useState<Narration | null>(initialNarration);
  const [renders, setRenders] = useState<RenderRecord[]>(initialRenders);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [showLog, setShowLog] = useState(false);
  const pollRef = useRef<number | null>(null);

  /* ---------------------------------------------------------------- parsing */

  const parsed = useMemo(() => parseScript(yamlText), [yamlText]);
  // Keep `scenes` identity-stable per parse: it feeds the memo chain below, and
  // a fresh array every render would rebuild props and re-render the Player.
  const scenes = useMemo(() => (parsed.ok ? parsed.scenes : []), [parsed]);
  const meta = parsed.ok ? parsed.doc : null;
  const errors = parsed.ok ? [] : parsed.errors;

  const theme = useMemo(() => themeFromDoc(meta ?? { name: "midnight" } as ScriptDoc), [meta]);

  const filtered = useMemo(() => filterNarration(narration, scenes), [narration, scenes]);

  const props: StudioProps | null = useMemo(() => {
    if (!meta || !scenes.length) return null;
    return {
      fps: meta.fps,
      width: meta.width,
      height: meta.height,
      gap: meta.gap,
      theme,
      captions: meta.captions,
      scenes,
      narration: filtered.narration,
    };
  }, [meta, scenes, theme, filtered.narration]);

  const timeline = useMemo(
    () => (props ? buildTimeline(props, props.narration) : null),
    [props],
  );

  /* ------------------------------------------------------------- edits */

  const onProseChange = (next: string) => {
    setProseText(next);
    setDirty(true);
    const nextScenes = proseToScenes(next);
    if (!nextScenes.length) return;
    const doc = meta ?? ({ name, theme: theme.name, fps: 30, width: 1920, height: 1080, gap: 0.45, captions: { enabled: true, maxWords: 6, maxSeconds: 3.2, fontSize: 40 }, scenes: [] } as unknown as ScriptDoc);
    setYamlText(toScriptYaml(projectFromDoc(doc, nextScenes)));
  };

  const onYamlChange = (next: string) => {
    setYamlText(next);
    setDirty(true);
    const result = parseScript(next);
    if (result.ok) setProseText(scenesToProse(result.scenes));
  };

  /** Rewrite the YAML through the parser so the two panes never disagree. */
  const rewrite = (change: (doc: ScriptDoc) => ScriptDoc) => {
    if (!parsed.ok) return;
    const next = change(parsed.doc);
    setYamlText(toScriptYaml(projectFromDoc(next, parsed.scenes)));
    setDirty(true);
  };

  /** A written script replaces the editor contents wholesale. */
  const applyWritten = useCallback((yaml: string, writtenName: string) => {
    setYamlText(yaml);
    setName((current) => (/^untitled/i.test(current) || !current.trim() ? writtenName : current));
    setDirty(true);
    const result = parseScript(yaml);
    if (result.ok) setProseText(scenesToProse(result.scenes));
  }, []);

  const setSceneVoice = useCallback((sceneId: number, voice: string | undefined) => {
    // Rebuild the document rather than patching YAML text: the serialiser is the
    // one place that knows how to write a scene back out.
    setYamlText((current) => {
      const result = parseScript(current);
      if (!result.ok) return current;
      const scenes = result.scenes.map((s) => (s.id === sceneId ? { ...s, voice } : s));
      return toScriptYaml(projectFromDoc(result.doc, scenes));
    });
    setDirty(true);
  }, []);

  /** Staging edits: mode plus who is on screen. Empty strings drop the field. */
  const setSceneStaging = useCallback(
    (sceneId: number, patch: { mode?: SceneSpec["mode"]; speaker?: string; listener?: string }) => {
      setYamlText((current) => {
        const result = parseScript(current);
        if (!result.ok) return current;
        const scenes = result.scenes.map((s) => {
          if (s.id !== sceneId) return s;
          const next: SceneSpec = { ...s, mode: patch.mode ?? s.mode };
          for (const key of ["speaker", "listener"] as const) {
            if (patch[key] === undefined) continue;
            const value = patch[key]?.trim();
            if (value) next[key] = value;
            else delete next[key];
          }
          return next;
        });
        return toScriptYaml(projectFromDoc(result.doc, scenes));
      });
      setDirty(true);
    },
    [],
  );

  /* ------------------------------------------------------------- server calls */

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((n) => (n === message ? null : n)), 3200);
  };

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { project: { name: string; renders: RenderRecord[] }; narration: Narration | null };
    setName(data.project.name);
    setRenders(data.project.renders);
    setNarration(data.narration);
  }, [projectId]);

  const save = useCallback(
    async (quiet = false) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ yaml: yamlText }),
        });
        const data = await res.json();
        if (!res.ok) {
          flash(`save failed: ${(data.errors ?? [data.error]).join("; ")}`);
          return false;
        }
        setDirty(false);
        if (!quiet) flash("saved");
        await refresh();
        return true;
      } finally {
        setSaving(false);
      }
    },
    [projectId, yamlText, refresh],
  );

  const poll = useCallback(
    (jobId: string) => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) return;
        const { job: next } = (await res.json()) as { job: Job };
        setJob(next);
        if (next.state === "done" || next.state === "error") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          await refresh();
          flash(next.state === "done" ? `${next.kind} finished` : `${next.kind} failed`);
        }
      }, 1000);
    },
    [refresh],
  );

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  const startJob = async (kind: "narrate" | "render", mode?: "draft" | "full") => {
    const ok = await save(true);
    if (!ok) return;
    const res = await fetch(`/api/projects/${projectId}/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kind === "render" ? { mode } : {}),
    });
    const data = await res.json();
    if (!res.ok) {
      flash(data.error ?? "could not start");
      return;
    }
    setJob(data.job);
    setShowLog(true);
    poll(data.job.id);
  };

  const busy = job !== null && (job.state === "queued" || job.state === "running");
  const latest = renders[0];

  /* ------------------------------------------------------------------ render */

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-4 p-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm font-semibold text-muted hover:text-ink">
          ← Projects
        </Link>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          onBlur={() => void save(true)}
          className="min-w-[220px] flex-1 rounded-xl border border-line bg-panel px-3 py-2 text-lg font-bold text-ink outline-none focus:border-accent/70"
        />
        <Tag color={dirty ? "#F1C40F" : "#2ECC71"}>{dirty ? "unsaved" : "saved"}</Tag>
        {timeline && (
          <Tag color="#8FA0C8">
            {scenes.length} scenes · {fmtDuration(timeline.durationSeconds)}
            {filtered.missing > 0 ? ` · ${filtered.missing} not narrated` : ""}
          </Tag>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={saving || busy}>
            {saving ? "saving…" : "Save"}
          </Button>
          <Button variant="primary" onClick={() => void startJob("narrate")} disabled={busy || !parsed.ok}>
            🎙 Narrate
          </Button>
          <Button onClick={() => void startJob("render", "draft")} disabled={busy || !parsed.ok} title="Half resolution, fast">
            Draft MP4
          </Button>
          <Button onClick={() => void startJob("render", "full")} disabled={busy || !parsed.ok} title="1920x1080, slow">
            Full MP4
          </Button>
          <Button href={`/api/projects/${projectId}/srt`} title="Download subtitles">
            SRT
          </Button>
        </div>
      </header>

      {notice && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-ink">{notice}</div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ------------------------------------------------------- preview */}
        <Card className="p-4">
          {props ? (
            <Preview props={props} />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
              Nothing to preview yet — fix the errors on the right.
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>
              Preview uses the real composition.{" "}
              {filtered.missing > 0
                ? `${filtered.missing} scene(s) have no audio yet - timings are estimates.`
                : "Narration is in sync."}
            </span>
            {latest && (
              <a className="font-semibold text-accent hover:underline" href={latest.url} download>
                ↓ latest render ({latest.mode}, {fmtBytes(latest.bytes)})
              </a>
            )}
          </div>
        </Card>

        {/* ----------------------------------------------------- inspector */}
        <div className="flex flex-col gap-4">
          <ScriptWriter onApply={applyWritten} disabled={busy} />

          <Card className="p-4">
            <VoicePanel
              voices={voices}
              projectVoice={meta?.voice ?? voices[0]?.id ?? "lessac"}
              scenes={scenes.map((s) => ({ id: s.id, title: s.title, voice: s.voice }))}
              onProjectVoice={(id) => rewrite((d) => ({ ...d, voice: id }))}
              onSceneVoice={setSceneVoice}
            />
          </Card>

          <Card className="p-4">
            <SceneInspector
              scenes={scenes.map((s) => ({
                id: s.id,
                title: s.title,
                mode: s.mode ?? "board",
                speaker: s.speaker,
                listener: s.listener,
              }))}
              declared={(meta?.cast ?? []).map((c) => c.id).filter(Boolean)}
              onChange={setSceneStaging}
            />
          </Card>

          <Card className="flex flex-col gap-4 p-4">
            <Field label="Theme">
              <select
                value={theme.name}
                onChange={(e) => rewrite((d) => ({ ...d, theme: e.target.value }))}
                className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none"
              >
                {THEMES.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex flex-wrap gap-1.5">
              {theme.palette.map((c) => (
                <span key={c} className="h-5 w-5 rounded-md border border-black/30" style={{ background: c }} />
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Captions">
                <Toggle
                  checked={meta?.captions.enabled ?? true}
                  label={meta?.captions.enabled ? "on" : "off"}
                  onChange={(v) => rewrite((d) => ({ ...d, captions: { ...d.captions, enabled: v } }))}
                />
              </Field>
              <Field label="Words / cue">
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={meta?.captions.maxWords ?? 6}
                  onChange={(e) =>
                    rewrite((d) => ({ ...d, captions: { ...d.captions, maxWords: Number(e.target.value) } }))
                  }
                  className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none"
                />
              </Field>
              <Field label="Caption size">
                <input
                  type="number"
                  min={16}
                  max={80}
                  value={meta?.captions.fontSize ?? 40}
                  onChange={(e) =>
                    rewrite((d) => ({ ...d, captions: { ...d.captions, fontSize: Number(e.target.value) } }))
                  }
                  className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none"
                />
              </Field>
              <Field label="Gap (sec)" hint="Silence between scenes">
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={3}
                  value={meta?.gap ?? 0.45}
                  onChange={(e) => rewrite((d) => ({ ...d, gap: Number(e.target.value) }))}
                  className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none"
                />
              </Field>
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Job</span>
              {job && <Tag color={job.state === "error" ? "#E74C3C" : job.state === "done" ? "#2ECC71" : "#F1C40F"}>{job.state}</Tag>}
            </div>
            {job ? (
              <>
                <Bar value={job.progress} tone={job.state === "error" ? "red" : "accent"} />
                <div className="text-xs text-muted">{job.message}</div>
                {job.error && <div className="text-xs text-red-300">{job.error}</div>}
                <button
                  className="self-start text-xs font-semibold text-accent hover:underline"
                  onClick={() => setShowLog((s) => !s)}
                  type="button"
                >
                  {showLog ? "hide log" : "show log"}
                </button>
                {showLog && (
                  <pre className="max-h-56 overflow-auto rounded-xl border border-line bg-[#070b18] p-3 text-[11px] leading-relaxed text-[#b9c7e8]">
                    {job.log.slice(-60).join("\n")}
                  </pre>
                )}
              </>
            ) : (
              <div className="text-xs text-muted">
                Nothing running. Narrate adds voice + timings; renders are queued one at a time.
              </div>
            )}
          </Card>

          {renders.length > 0 && (
            <Card className="flex flex-col gap-2 p-4">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Renders</span>
              {renders.map((r) => (
                <a key={r.id} href={r.url} download className="flex items-center justify-between text-xs text-ink hover:text-accent">
                  <span className="truncate">
                    {r.mode} · {r.width}×{r.height}
                  </span>
                  <span className="text-muted">{fmtBytes(r.bytes)} ↓</span>
                </a>
              ))}
            </Card>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------- editors */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Prose</span>
            <span className="text-[11px] text-muted">headings + paragraphs → scenes</span>
          </div>
          <textarea
            className="editor h-[380px] w-full resize-y rounded-xl border border-line bg-[#070b18] p-3 text-ink outline-none focus:border-accent/60"
            value={proseText}
            onChange={(e) => onProseChange(e.target.value)}
            spellCheck={false}
          />
          <span className="text-[11px] text-muted">
            Editing prose regenerates the YAML: scenes split at headings/blank lines, blocks are inferred.
          </span>
        </Card>

        <Card className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted">YAML</span>
            <span className="text-[11px] text-muted">the source of truth</span>
          </div>
          <textarea
            className="editor h-[380px] w-full resize-y rounded-xl border border-line bg-[#070b18] p-3 text-ink outline-none focus:border-accent/60"
            value={yamlText}
            onChange={(e) => onYamlChange(e.target.value)}
            spellCheck={false}
          />
          {errors.length > 0 ? (
            <ul className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[11px] text-red-200">
              {errors.slice(0, 6).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : (
            <span className="text-[11px] text-muted">
              Blocks: title · bullets · cards · stack · steps · compare · code · mnemonic · outro ·
              quote · callout · timeline · table · diagram · chapter · stat · keypoints
            </span>
          )}
        </Card>
      </div>
    </div>
  );
}
