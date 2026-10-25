"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import { CAST_PRESETS } from "@/lib/engine/cast";

/**
 * Per-scene staging: how a scene is laid out, and who is on screen talking.
 *
 * This is deliberately a list rather than a "select a scene" dropdown: you want
 * to see at a glance which scenes have characters and which are plain boards,
 * because that is what makes a 20-scene script feel varied rather than uniform.
 */

export type SceneRow = {
  id: number;
  title: string;
  mode: "board" | "character" | "dialogue";
  speaker?: string;
  listener?: string;
};

type Props = {
  scenes: SceneRow[];
  /** Ids declared in the doc's `cast:` list, in addition to the presets. */
  declared: string[];
  onChange: (
    sceneId: number,
    patch: { mode?: SceneRow["mode"]; speaker?: string; listener?: string },
  ) => void;
};

const MODES: { id: SceneRow["mode"]; label: string; hint: string }[] = [
  { id: "board", label: "board", hint: "Blocks only" },
  { id: "character", label: "character", hint: "One figure beside the blocks" },
  { id: "dialogue", label: "dialogue", hint: "Two figures facing each other" },
];

export function SceneInspector({ scenes, declared, onChange }: Props) {
  const [open, setOpen] = useState<number | null>(null);

  // Presets first, then anything the document declares that is not already a
  // preset — so a custom `cast:` entry is pickable without a free-text field.
  const people = [
    ...CAST_PRESETS.map((c) => c.id),
    ...declared.filter((d) => !CAST_PRESETS.some((c) => c.id === d)),
  ];
  const staged = scenes.filter((s) => s.mode !== "board").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Staging</span>
        <span className="text-[11px] text-muted">
          {staged}/{scenes.length} with characters
        </span>
      </div>

      <div className="flex max-h-[280px] flex-col gap-1 overflow-auto pr-1">
        {scenes.map((s) => {
          const isOpen = open === s.id;
          return (
            <div key={s.id} className="rounded-xl border border-line bg-panel2/60">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <span className="w-6 shrink-0 text-[11px] tabular-nums text-muted">
                  {String(s.id).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{s.title}</span>
                {s.mode !== "board" && (
                  <span className="shrink-0 text-[10px] font-semibold text-accent">
                    {s.speaker ?? "?"}
                    {s.mode === "dialogue" ? ` ⟷ ${s.listener ?? "?"}` : ""}
                  </span>
                )}
                <span className="shrink-0 text-[10px] text-muted">{s.mode}</span>
              </button>

              {isOpen && (
                <div className="flex flex-col gap-2 border-t border-line px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        title={m.hint}
                        onClick={() =>
                          onChange(s.id, {
                            mode: m.id,
                            // Dropping the people when leaving a staged mode keeps
                            // the YAML honest: no dangling speaker on a board scene.
                            ...(m.id === "board" ? { speaker: "", listener: "" } : {}),
                            ...(m.id === "character" && !s.speaker ? { speaker: people[0] } : {}),
                            ...(m.id === "dialogue" && !s.speaker ? { speaker: people[0] } : {}),
                            ...(m.id === "dialogue" && !s.listener ? { listener: people[1] ?? people[0] } : {}),
                          })
                        }
                        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                          s.mode === m.id
                            ? "border-accent bg-accent/15 text-ink"
                            : "border-line text-muted hover:text-ink"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {s.mode !== "board" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={s.mode === "dialogue" ? "Speaker" : "Character"}>
                        <select
                          value={s.speaker ?? people[0]}
                          onChange={(e) => onChange(s.id, { speaker: e.target.value })}
                          className="w-full rounded-lg border border-line bg-panel px-2 py-1 text-xs text-ink outline-none"
                        >
                          {people.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {s.mode === "dialogue" && (
                        <Field label="Listener">
                          <select
                            value={s.listener ?? people[1] ?? people[0]}
                            onChange={(e) => onChange(s.id, { listener: e.target.value })}
                            className="w-full rounded-lg border border-line bg-panel px-2 py-1 text-xs text-ink outline-none"
                          >
                            {people.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <span className="text-[11px] text-muted">
        A character&apos;s voice comes from the scene voice; set it in the voice panel to give each
        speaker their own sound.
      </span>
    </div>
  );
}
