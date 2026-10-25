import { NewProject } from "@/components/NewProject";
import { ProjectList } from "@/components/ProjectList";
import { listJobs } from "@/lib/engine/jobs";
import { health } from "@/lib/engine/paths";
import { listProjects } from "@/lib/engine/store";

export const dynamic = "force-dynamic";

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
};

export default function Home() {
  const checks = health();
  const blocking = checks.filter((c) => !c.ok);
  const projects = listProjects();
  const jobs = listJobs(6);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            code<span className="text-accent">2</span>video
          </h1>
          <p className="mt-1 text-sm text-muted">
            Write a script. Get a narrated, captioned, ready-to-upload video. No editor, no timeline.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className={`h-2 w-2 rounded-full ${blocking.length ? "bg-red-400" : "bg-emerald-400 dot-live"}`} />
          {blocking.length ? `${blocking.length} engine problem(s)` : "engine ready"}
        </div>
      </header>

      {blocking.length > 0 && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
          <div className="mb-2 text-sm font-bold text-red-200">The engine is not fully available</div>
          <ul className="flex flex-col gap-1 text-xs text-red-100">
            {blocking.map((c) => (
              <li key={c.key}>
                <span className="font-semibold">{c.label}</span> — {c.detail}
                {c.critical !== "none" ? ` (blocks ${c.critical})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { n: "1", t: "Write", d: "Prose or YAML. Blocks are inferred, then editable." },
          { n: "2", t: "Narrate", d: "Piper speaks it, whisper aligns every word." },
          { n: "3", t: "Export", d: "MP4 up to 1080p plus an .srt, from the browser." },
        ].map((s) => (
          <div key={s.n} className="rounded-2xl border border-line bg-panel p-4">
            <div className="text-xs font-black text-accent">STEP {s.n}</div>
            <div className="mt-1 font-bold">{s.t}</div>
            <div className="mt-1 text-xs text-muted">{s.d}</div>
          </div>
        ))}
      </div>

      <NewProject />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted">Your videos ({projects.length})</h2>
        <ProjectList projects={projects} />
      </section>

      {jobs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted">Recent jobs</h2>
          <div className="overflow-hidden rounded-2xl border border-line">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-3 border-b border-line/60 bg-panel px-4 py-2 text-xs last:border-b-0">
                <span
                  className={`h-2 w-2 rounded-full ${
                    j.state === "done" ? "bg-emerald-400" : j.state === "error" ? "bg-red-400" : "bg-amber-300"
                  }`}
                />
                <span className="font-semibold text-ink">{j.kind}</span>
                <span className="truncate text-muted">{j.projectId}</span>
                <span className="ml-auto shrink-0 text-muted">{j.message}</span>
                <span className="shrink-0 text-muted/70">{fmtWhen(j.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <details className="rounded-2xl border border-line bg-panel p-4">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-muted">
          Engine checks ({checks.length})
        </summary>
        <ul className="mt-3 flex flex-col gap-1 text-xs">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-2">
              <span className={c.ok ? "text-emerald-400" : "text-red-400"}>{c.ok ? "✓" : "✗"}</span>
              <span className="w-40 shrink-0 font-semibold text-ink">{c.label}</span>
              <span className="truncate text-muted">{c.detail}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
