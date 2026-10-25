/**
 * The cast: flat vector people the composition can draw and lip-sync.
 *
 * A character is *data* — a handful of colours and a few shape choices — so it
 * travels inside the YAML and renders identically in the browser preview and in
 * the server-side renderer. No image assets, nothing to load.
 */

export type HairStyle = "short" | "bun" | "long" | "curly" | "bald" | "cap";
export type Build = "slim" | "regular" | "broad";

export type CharacterLook = {
  /** Stable id referenced by `speaker:` on a scene. */
  id: string;
  name: string;
  skin: string;
  hair: string;
  shirt: string;
  hairStyle: HairStyle;
  /** Glasses, headphones, a tie — small props that read at 1080p. */
  accessory?: "glasses" | "headphones" | "tie" | "scarf" | "none";
  build?: Build;
  /** Piper voice this character speaks with. */
  voice?: string;
};

/** Four ready-made people, so a dialogue scene needs no design work. */
export const CAST_PRESETS: CharacterLook[] = [
  {
    id: "narrator",
    name: "Narrator",
    skin: "#E8B98F",
    hair: "#3A2A20",
    shirt: "#3498DB",
    hairStyle: "short",
    accessory: "none",
    build: "regular",
  },
  {
    id: "teacher",
    name: "Teacher",
    skin: "#C98A5E",
    hair: "#1F2A38",
    shirt: "#1ABC9C",
    hairStyle: "bun",
    accessory: "glasses",
    build: "slim",
  },
  {
    id: "expert",
    name: "Expert",
    skin: "#F0C9A0",
    hair: "#8A6A4A",
    shirt: "#E67E22",
    hairStyle: "short",
    accessory: "tie",
    build: "broad",
  },
  {
    id: "student",
    name: "Student",
    skin: "#8C5A3C",
    hair: "#12151C",
    shirt: "#9B59B6",
    hairStyle: "curly",
    accessory: "headphones",
    build: "slim",
  },
];

export const HAIR_STYLES: HairStyle[] = ["short", "bun", "long", "curly", "bald", "cap"];
export const ACCESSORIES: NonNullable<CharacterLook["accessory"]>[] = [
  "none",
  "glasses",
  "headphones",
  "tie",
  "scarf",
];

export function castById(id: string | null | undefined): CharacterLook | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase();
  return CAST_PRESETS.find((c) => c.id === key);
}

/**
 * Resolve a speaker reference: a preset id, or a fully spelled-out character
 * declared in the doc's `cast` list. The declared entry wins field by field,
 * and any field it leaves out falls back to the preset (or a neutral default),
 * so a half-written cast entry still renders a complete person.
 */
export function resolveCast(
  speakers: unknown,
  id: string | null | undefined,
): CharacterLook | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase();
  const declared = Array.isArray(speakers)
    ? (speakers as Partial<CharacterLook>[]).find((c) => c && String(c.id).toLowerCase() === key)
    : undefined;
  const preset = castById(key);
  if (!declared && !preset) return undefined;
  const base = preset ?? {
    id: key,
    name: key,
    skin: "#E8B98F",
    hair: "#3A2A20",
    shirt: "#3498DB",
    hairStyle: "short" as const,
  };
  return { ...base, ...declared, id: key };
}

/** Colours for a character's outfit, used by the little name plate. */
export function castColor(look: CharacterLook | undefined, fallback: string): string {
  return look?.shirt ?? fallback;
}
