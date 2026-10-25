import { DEFAULT_CAPTIONS } from "../lib/engine/types";
import { DEFAULT_THEME } from "../lib/engine/themes";
import type { StudioProps } from "./Studio";

/**
 * Default props so `remotion studio` and a bare bundle() still work without the
 * Next.js app feeding them in. Kept intentionally tiny.
 */
export const demoProps: StudioProps = {
  fps: 30,
  width: 1920,
  height: 1080,
  gap: 0.45,
  theme: DEFAULT_THEME,
  captions: { ...DEFAULT_CAPTIONS },
  scenes: [
    {
      id: 1,
      slug: "scene-01",
      title: "Hello code2video",
      narration: "Write a script, and this is what comes out. Seven visual blocks, one voice.",
      blocks: [
        { type: "title", text: "code2video", sub: "script in, video out" },
        { type: "bullets", items: ["Write prose or YAML", "Preview instantly in the browser", "Export MP4 and SRT"] },
      ],
    },
    {
      id: 2,
      slug: "scene-02",
      title: "Blocks",
      narration: "Titles, bullets, cards, stacks, steps, comparisons, code and mnemonics.",
      blocks: [
        { type: "cards", items: [{ label: "cards" }, { label: "stack" }, { label: "compare" }, { label: "code" }] },
      ],
    },
  ],
  narration: null,
};
