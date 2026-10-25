"use client";

import { Field, Tag } from "@/components/ui";

/**
 * Voice picking: one default for the project, plus a per-scene override so a
 * single video can be a two- or three-person conversation.
 *
 * The list comes from lib/engine/voices.ts, which is the same source the Piper
 * engine resolves paths from - a voice shown here is a voice that can speak.
 */

export type VoiceOption = {
  id: string;
  label: string;
  lang: string;
  gender: string;
  blurb: string;
  best: string;
  color: string;
  installed: boolean;
};

export function VoicePanel({
  voices,
  projectVoice,
  scenes,
  onProjectVoice,
  onSceneVoice,
}: {
  voices: VoiceOption[];
  projectVoice: string;
  scenes: { id: number; title: string; voice?: string }[];
  onProjectVoice: (id: string) => void;
  onSceneVoice: (sceneId: number, voice: string | undefined) => void;
}) {
  const installed = voices.filter((v) => v.installed);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Voices</span>
        <Tag color={installed.length > 1 ? "#2ECC71" : "#F1C40F"}>
          {installed.length}/{voices.length} installed
        </Tag>
      </div>

      <Field label="Default voice" hint="Used by every scene that does not pick its own.">
        <select
          value={projectVoice}
          onChange={(e) => onProjectVoice(e.target.value)}
          className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id} disabled={!v.installed}>
              {v.label} · {v.lang} · {v.gender}
              {v.installed ? "" : " (not downloaded)"}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex flex-col gap-1.5">
        {voices.map((v) => (
          <div key={v.id} className="flex items-start gap-2 text-[11px]">
            <span
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: v.installed ? v.color : "#4a5570" }}
            />
            <span className="text-muted">
              <b className="text-ink">{v.label}</b> — {v.blurb}{" "}
              <span className="text-muted/70">({v.best})</span>
              {!v.installed && (
                <span className="text-yellow-200"> — run: npm run voices</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {scenes.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Per scene</span>
          <div className="flex max-h-64 flex-col gap-1.5 overflow-auto pr-1">
            {scenes.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-6 shrink-0 text-right text-muted">{s.id}</span>
                <span className="min-w-0 flex-1 truncate text-ink" title={s.title}>
                  {s.title}
                </span>
                <select
                  value={s.voice ?? ""}
                  onChange={(e) => onSceneVoice(s.id, e.target.value || undefined)}
                  className="shrink-0 rounded-lg border border-line bg-panel2 px-2 py-1 text-[11px] text-ink outline-none"
                >
                  <option value="">default</option>
                  {voices.map((v) => (
                    <option key={v.id} value={v.id} disabled={!v.installed}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <span className="text-[11px] text-muted">
            Changing a scene&apos;s voice re-narrates just that scene — the rest is cached.
          </span>
        </div>
      )}
    </div>
  );
}
