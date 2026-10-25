"use client";

import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-panel ${className}`}
      style={{ boxShadow: "0 18px 40px rgba(0,0,0,.35)", ...style }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  title,
  href,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  title?: string;
  href?: string;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed";
  const styles: Record<string, string> = {
    primary: "bg-accent text-[#04121c] hover:brightness-110",
    ghost: "bg-panel2 text-ink border border-line hover:border-accent/60",
    danger: "bg-transparent text-red-300 border border-red-500/40 hover:border-red-400",
  };
  const cls = `${base} ${styles[variant]} ${className}`;
  if (href) {
    return (
      <a className={cls} href={href} title={title} download>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} onClick={onClick} disabled={disabled} title={title} type="button">
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted/80">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm text-ink"
    >
      <span
        className={`flex h-5 w-9 items-center rounded-full border p-0.5 transition ${
          checked ? "border-accent bg-accent/30" : "border-line bg-panel2"
        }`}
      >
        <span
          className={`h-3.5 w-3.5 rounded-full transition ${checked ? "translate-x-4 bg-accent" : "bg-muted"}`}
        />
      </span>
      {label}
    </button>
  );
}

export function Bar({ value, tone = "accent" }: { value: number; tone?: "accent" | "red" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${tone === "red" ? "bg-red-400" : "bg-accent"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Tag({ children, color = "#4FD1FF" }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
      style={{ color, background: `${color}1f`, border: `1px solid ${color}55` }}
    >
      {children}
    </span>
  );
}
