"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectSummary } from "@/lib/engine/store";

const fmtDuration = (seconds: number) => {
  if (!seconds) return "not narrated";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function ProjectList({ projects }: { projects: ProjectSummary[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This removes its audio and renders too.`)) return;
    setBusyId(id);
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (!projects.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
        No videos yet. Create one above — the OSI Model template is the fastest way to see the whole pipeline run.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => (
        <div
          key={p.id}
          className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 transition hover:border-accent/50"
        >
          <Link href={`/studio/${p.id}`} className="flex flex-col gap-2">
            <span className="truncate text-base font-bold text-ink">{p.name}</span>
            <span className="text-xs text-muted">
              {p.sceneCount} scenes · {fmtDuration(p.totalSeconds)} · theme {p.themeName}
            </span>
            <span className="text-xs text-muted">
              {p.hasNarration ? "🎙 narrated" : "no narration yet"} · {p.renders} render{p.renders === 1 ? "" : "s"}
            </span>
          </Link>
          <div className="flex items-center justify-between">
            <Link href={`/studio/${p.id}`} className="text-xs font-semibold text-accent hover:underline">
              Open studio →
            </Link>
            <button
              type="button"
              onClick={() => void remove(p.id, p.name)}
              disabled={busyId === p.id}
              className="text-xs text-muted hover:text-red-300 disabled:opacity-40"
            >
              {busyId === p.id ? "deleting…" : "delete"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
