"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field } from "@/components/ui";
import { TEMPLATES, templateById } from "@/lib/templates";

export function NewProject() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("osi");
  const [prose, setProse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const template = templateById(templateId);
      const body: Record<string, string> = { name: name.trim() || template.name };
      // Templates are expanded server-side and validated through the parser.
      if (prose.trim()) body.prose = prose;
      else if (template.project) body.template = templateId;

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data.errors ?? [data.error ?? "could not create"]).join("; "));
        return;
      }
      router.push(`/studio/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="text-sm font-bold uppercase tracking-widest text-muted">New video</div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My explainer"
            className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none focus:border-accent/70"
          />
        </Field>
        <Field label="Start from">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="rounded-xl border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.description}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Or paste a script" hint="Headings become scenes. Leave empty to use the template above.">
        <textarea
          value={prose}
          onChange={(e) => setProse(e.target.value)}
          rows={5}
          placeholder={"## Cold open\n\nEvery second, millions of messages cross the world.\n\n## The problem\n\nMost people never learn how it actually works."}
          className="editor rounded-xl border border-line bg-[#070b18] p-3 text-ink outline-none focus:border-accent/60"
          spellCheck={false}
        />
      </Field>

      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={() => void create()} disabled={busy}>
          {busy ? "creating…" : "Create video"}
        </Button>
        <span className="text-xs text-muted">You can change everything later.</span>
      </div>
    </Card>
  );
}
