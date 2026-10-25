import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionOptions, ThemeSpec } from "../lib/engine/types";
import type { CaptionChunk } from "../lib/video/timeline";

/** Backdrop, corner chip, banner and burned-in captions. */

export const Background: React.FC<{ theme: ThemeSpec; tint: string }> = ({ theme, tint }) => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.35) % 80;
  const light = isLight(theme);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 120% at 50% 0%, ${theme.bg2} 0%, ${theme.bg} 55%, ${theme.deep} 100%)` }}>
      {theme.grid && (
        <AbsoluteFill
          style={{
            opacity: light ? 0.5 : 0.28,
            backgroundImage: `linear-gradient(${tint}22 1px, transparent 1px), linear-gradient(90deg, ${tint}22 1px, transparent 1px)`,
            backgroundSize: "80px 80px",
            backgroundPosition: `${drift}px ${drift}px`,
            maskImage: "radial-gradient(70% 70% at 50% 50%, #000 40%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(70% 70% at 50% 50%, #000 40%, transparent 100%)",
          }}
        />
      )}
      <AbsoluteFill style={{ background: `radial-gradient(60% 50% at 50% 45%, ${tint}1f 0%, transparent 70%)` }} />
    </AbsoluteFill>
  );
};

/** A theme is "light" when its page colour is bright - used for contrast tweaks. */
export function isLight(theme: ThemeSpec): boolean {
  const hex = theme.bg.replace("#", "");
  if (hex.length < 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

export const SceneChip: React.FC<{
  n: number;
  total: number;
  color: string;
  label: string;
  theme: ThemeSpec;
}> = ({ n, total, color, label, theme }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: 44, left: 56, display: "flex", alignItems: "center", gap: 14, opacity: o * 0.95 }}>
      <div
        style={{
          padding: "6px 14px",
          borderRadius: 8,
          border: `1px solid ${color}88`,
          color,
          fontSize: 22,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {String(n).padStart(2, "0")} / {total}
      </div>
      <div style={{ color: theme.muted, fontSize: 22, fontWeight: 600, letterSpacing: 3 }}>{label.toUpperCase()}</div>
    </div>
  );
};

export const Banner: React.FC<{
  color: string;
  title: string;
  sub?: string;
  delay?: number;
  theme: ThemeSpec;
}> = ({ color, title, sub, delay = 0, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16 } });
  if (frame < delay) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 122,
        display: "flex",
        justifyContent: "center",
        transform: `translateY(${(1 - s) * 90}px)`,
        opacity: s,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "14px 28px",
          borderRadius: 999,
          background: isLight(theme) ? "rgba(255,255,255,.92)" : "rgba(6,9,22,.9)",
          border: `1px solid ${color}aa`,
          boxShadow: `0 0 40px ${color}55`,
        }}
      >
        <span style={{ width: 14, height: 14, borderRadius: 999, background: color, boxShadow: `0 0 18px ${color}` }} />
        <span style={{ color: theme.ink, fontSize: 30, fontWeight: 800, letterSpacing: 0.5 }}>{title}</span>
        {sub && (
          <>
            <span style={{ color: theme.dim, fontSize: 26 }}>·</span>
            <span style={{ color: theme.muted, fontSize: 26, fontWeight: 600 }}>{sub}</span>
          </>
        )}
      </div>
    </div>
  );
};

export const Badge: React.FC<{
  label: string;
  sub?: string;
  color: string;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ label, sub, color, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 11, mass: 0.7 } });
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 170,
        padding: "16px 22px",
        borderRadius: 18,
        background: "rgba(8,12,28,.92)",
        border: `2px solid ${color}`,
        boxShadow: `0 0 34px ${color}55, inset 0 0 26px ${color}22`,
        transform: `scale(${0.6 + s * 0.4})`,
        opacity: s,
        ...style,
      }}
    >
      <div style={{ color, fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>{label}</div>
      {sub && <div style={{ color: "#9fb0d6", fontSize: 18, marginTop: 4 }}>{sub}</div>}
    </div>
  );
};

export const SpeakerTag: React.FC<{ name: string; color: string; theme: ThemeSpec }> = ({
  name,
  color,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 15, mass: 0.6 } });
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div
      style={{
        position: "absolute",
        top: 40,
        right: 56,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 18px 8px 8px",
        borderRadius: 999,
        background: isLight(theme) ? "rgba(255,255,255,.9)" : "rgba(6,9,22,.85)",
        border: `1px solid ${color}aa`,
        boxShadow: `0 0 26px ${color}44`,
        opacity: s,
        transform: `translateX(${(1 - s) * 26}px)`,
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          background: `${color}26`,
          border: `2px solid ${color}`,
          color,
          fontSize: 20,
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {initial}
      </span>
      <span style={{ color: theme.ink, fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>
        {name.toUpperCase()}
      </span>
    </div>
  );
};

export const Captions: React.FC<{ chunks: CaptionChunk[]; opts: CaptionOptions; theme: ThemeSpec }> = ({
  chunks,
  opts,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!opts.enabled) return null;
  const t = frame / fps;
  const active = chunks.find((c) => t >= c.start - 0.06 && t <= c.end + 0.25);
  if (!active) return null;
  const o = interpolate(t, [active.start - 0.06, active.start + 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const light = isLight(theme);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 28, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          maxWidth: 1520,
          textAlign: "center",
          padding: "12px 26px",
          borderRadius: 14,
          background: light ? "rgba(255,255,255,.86)" : "rgba(3,5,12,.72)",
          color: light ? "#111a2b" : "#fff",
          fontSize: opts.fontSize,
          fontWeight: 800,
          lineHeight: 1.25,
          textShadow: light ? "none" : "0 3px 10px rgba(0,0,0,.9)",
          border: `1px solid ${light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.08)"}`,
        }}
      >
        {active.text}
      </div>
    </div>
  );
};
