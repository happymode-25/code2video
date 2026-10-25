import type { ThemeSpec } from "./types";

/** Midnight is the palette the OSI explainer was approved with. */
export const THEMES: ThemeSpec[] = [
  {
    name: "midnight",
    bg: "#0A0E27",
    bg2: "#111838",
    deep: "#05070f",
    ink: "#EAF0FF",
    muted: "#8FA0C8",
    dim: "#41507A",
    accent: "#4FD1FF",
    good: "#2ECC71",
    warn: "#F1C40F",
    palette: [
      "#9B59B6",
      "#3498DB",
      "#1ABC9C",
      "#F1C40F",
      "#E67E22",
      "#E74C3C",
      "#95A5A6",
      "#4FD1FF",
    ],
    font: '"Segoe UI", system-ui, -apple-system, sans-serif',
    grid: true,
  },
  {
    name: "nebula",
    bg: "#140A2E",
    bg2: "#221046",
    deep: "#08040f",
    ink: "#F3ECFF",
    muted: "#B9A6DD",
    dim: "#5A4B80",
    accent: "#C77DFF",
    good: "#5EE6A8",
    warn: "#FFD166",
    palette: ["#C77DFF", "#7B61FF", "#FF7BCB", "#4FD1FF", "#FFD166", "#FF8A5B", "#9AA0B5", "#5EE6A8"],
    font: '"Segoe UI", system-ui, -apple-system, sans-serif',
    grid: true,
  },
  {
    name: "carbon",
    bg: "#0D0D0F",
    bg2: "#17171B",
    deep: "#000000",
    ink: "#F2F2F2",
    muted: "#9A9AA3",
    dim: "#4A4A52",
    accent: "#FF6B35",
    good: "#3DDC84",
    warn: "#FFC857",
    palette: ["#FF6B35", "#3DDC84", "#4D9DE0", "#E15554", "#FFC857", "#A06CD5", "#8D99AE", "#F2F2F2"],
    font: '"Segoe UI", system-ui, -apple-system, sans-serif',
    grid: false,
  },
  {
    name: "daylight",
    bg: "#F4F6FB",
    bg2: "#E6EBF7",
    deep: "#FFFFFF",
    ink: "#131A2B",
    muted: "#5A6784",
    dim: "#AAB4CC",
    accent: "#2563EB",
    good: "#12945F",
    warn: "#B7791F",
    palette: ["#2563EB", "#7C3AED", "#0E9F8E", "#D97706", "#DC2626", "#0891B2", "#64748B", "#12945F"],
    font: '"Segoe UI", system-ui, -apple-system, sans-serif',
    grid: true,
  },
];

export const DEFAULT_THEME = THEMES[0];

export const themeByName = (name: string): ThemeSpec =>
  THEMES.find((t) => t.name === name) ?? DEFAULT_THEME;

/** Ensure a theme object from disk has every field (older projects). */
export function normaliseTheme(input: Partial<ThemeSpec> | undefined): ThemeSpec {
  const base = themeByName(input?.name ?? DEFAULT_THEME.name);
  return { ...base, ...(input ?? {}) };
}
