import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { CharacterLook } from "../lib/engine/cast";
import type { WordTiming } from "../lib/engine/types";

/**
 * Flat vector characters, drawn as SVG so they scale to any resolution and
 * need no assets.
 *
 * The mouth is the interesting part: it is driven by the **real word timings**
 * from faster-whisper, so a character's lips are open on the syllable that is
 * actually being spoken, closed in the gaps between words, and shaped by how
 * long each word lasts. That is what makes it read as speech rather than as a
 * looping animation.
 */

/** Deterministic pseudo-random in [0,1) - same value on every render. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export type Mouth = {
  /** 0 = closed, 1 = wide open. */
  open: number;
  /** -1 .. 1, which vowel-ish shape to draw. */
  wide: number;
};

/**
 * Turn word timings into a mouth shape for the given moment in the video.
 *
 * Inside a word the mouth oscillates a few times a second, which is roughly
 * what real speech does; between words it relaxes shut. Words with more
 * letters are given more open shapes, because they tend to be longer vowels.
 */
export function mouthAt(words: WordTiming[], t: number, fps: number): Mouth {
  if (!words.length) return { open: 0, wide: 0 };
  const frame = t * fps;

  // Binary search keeps this cheap: this runs on every frame of every render.
  let lo = 0;
  let hi = words.length - 1;
  let current: WordTiming | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = words[mid];
    if (frame < w.start * fps) hi = mid - 1;
    else if (frame > w.end * fps) lo = mid + 1;
    else {
      current = w;
      break;
    }
  }
  if (!current) {
    // Just after a word ends? Hold a small residual opening for ~2 frames so
    // the mouth does not snap shut mid-plosive.
    const previous = words[Math.max(0, lo - 1)];
    if (previous && frame - previous.end * fps < 2) {
      return { open: 0.16, wide: 0 };
    }
    return { open: 0, wide: 0 };
  }

  const span = Math.max(1, (current.end - current.start) * fps);
  const local = (frame - current.start * fps) / span; // 0..1 through the word
  const letters = current.word.replace(/[^a-z]/gi, "").length || 3;
  // Longer words open wider; short words stay clipped.
  const amplitude = Math.min(1, 0.45 + letters / 14);
  // ~5 flaps per second, phase-shifted per word so no two words look alike.
  const phase = hash(current.start * 7.3) * Math.PI * 2;
  const flap = 0.5 + 0.5 * Math.sin(local * span * 0.32 + phase);
  // Ease in and out of the word so the shape is not a hard square wave.
  const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, local)));
  const open = amplitude * (0.35 + 0.65 * flap) * (0.55 + 0.45 * envelope);
  const wide = Math.sin(local * span * 0.5 + phase * 1.7);
  return { open: Math.min(1, Math.max(0, open)), wide };
}

/* ------------------------------------------------------------------ shapes */

const Face: React.FC<{ look: CharacterLook; mouth: Mouth; blink: number; brow: number }> = ({
  look,
  mouth,
  blink,
  brow,
}) => {
  const eyeOpen = Math.max(0.06, 1 - blink);
  const mouthW = 26 + mouth.open * 10 + mouth.wide * 3;
  const mouthH = 3 + mouth.open * 17;

  return (
    <g>
      {/* head */}
      <rect x={-46} y={-58} width={92} height={104} rx={34} fill={look.skin} />
      {/* ears */}
      <circle cx={-46} cy={4} r={9} fill={look.skin} />
      <circle cx={46} cy={4} r={9} fill={look.skin} />
      {/* brows: raised by the expression value */}
      <rect x={-30} y={-24 - brow * 3} width={22} height={5} rx={2.5} fill={look.hair} opacity={0.9} />
      <rect x={8} y={-24 - brow * 3} width={22} height={5} rx={2.5} fill={look.hair} opacity={0.9} />
      {/* eyes */}
      <ellipse cx={-19} cy={-8} rx={7} ry={7 * eyeOpen} fill="#12161F" />
      <ellipse cx={19} cy={-8} rx={7} ry={7 * eyeOpen} fill="#12161F" />
      {/* mouth */}
      <ellipse cx={0} cy={26} rx={mouthW / 2} ry={mouthH / 2} fill="#5C2230" />
      {mouthH > 7 && (
        <rect
          x={-mouthW / 2 + 3}
          y={26 - mouthH / 2 + 1}
          width={mouthW - 6}
          height={2.5}
          rx={1}
          fill="#F2F2F2"
          opacity={0.75}
        />
      )}
      {/* nose */}
      <path d="M0 4 l-5 10 h10 z" fill="#0000001f" />
    </g>
  );
};

const Hair: React.FC<{ look: CharacterLook; phase: number }> = ({ look, phase }) => {
  const { hair, hairStyle } = look;
  switch (hairStyle) {
    case "bald":
      return null;
    case "bun":
      return (
        <g>
          <circle cx={0} cy={-62} r={17} fill={hair} />
          <path d="M-48-40 a48 48 0 0 1 96 0 v10 a48 40 0 0 1 -96 0 z" fill={hair} />
        </g>
      );
    case "long":
      return (
        <g>
          <path d="M-52-20 v66 a10 10 0 0 0 20 0 v-40 z" fill={hair} />
          <path d="M52-20 v66 a10 10 0 0 1 -20 0 v-40 z" fill={hair} />
          <path d="M-48-40 a48 48 0 0 1 96 0 v14 a48 40 0 0 1 -96 0 z" fill={hair} />
        </g>
      );
    case "curly":
      return (
        <g>
          {[-38, -20, 0, 20, 38].map((x, i) => (
            <circle key={x} cx={x} cy={-46 - (i % 2) * 8} r={19} fill={hair} />
          ))}
          <path d="M-48-38 a48 44 0 0 1 96 0 v10 a48 40 0 0 1 -96 0 z" fill={hair} />
        </g>
      );
    case "cap":
      return (
        <g>
          <path d="M-50-38 a50 46 0 0 1 100 0 v8 h-100 z" fill={hair} />
          <path d={`M-52-30 h104 a8 8 0 0 1 0 14 h-104 z`} fill={hair} opacity={0.85} />
          {phase > 0.5 && <circle cx={0} cy={-56} r={4} fill="#ffffff55" />}
        </g>
      );
    default:
      return <path d="M-48-38 a48 44 0 0 1 96 0 v12 a48 40 0 0 1 -96 0 z" fill={hair} />;
  }
};

const Accessory: React.FC<{ look: CharacterLook }> = ({ look }) => {
  switch (look.accessory) {
    case "glasses":
      return (
        <g stroke="#2B3446" strokeWidth={4} fill="none">
          <circle cx={-19} cy={-8} r={13} />
          <circle cx={19} cy={-8} r={13} />
          <path d="M-6-8 h12" />
          <path d="M-32-8 l-12-4" />
          <path d="M32-8 l12-4" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M-46-14 a46 46 0 0 1 92 0" stroke="#2B3446" strokeWidth={9} fill="none" />
          <rect x={-58} y={-16} width={16} height={30} rx={7} fill="#2B3446" />
          <rect x={42} y={-16} width={16} height={30} rx={7} fill="#2B3446" />
        </g>
      );
    case "tie":
      return (
        <g>
          <path d="M-10 42 h20 l-4 12 h-12 z" fill="#1F2A38" />
          <path d="M-7 54 h14 l-7 34 z" fill={look.shirt} />
        </g>
      );
    case "scarf":
      return (
        <g>
          <rect x={-30} y={40} width={60} height={14} rx={7} fill="#E74C3C" />
          <rect x={8} y={50} width={16} height={34} rx={6} fill="#E74C3C" opacity={0.9} />
        </g>
      );
    default:
      return null;
  }
};

/* -------------------------------------------------------------- component */

export type CharacterProps = {
  look: CharacterLook;
  /** Where they stand. */
  side: "left" | "right";
  /** Word timings for the audio playing now, or null when they are silent. */
  words: WordTiming[] | null;
  /** Their scene's accent colour. */
  accent: string;
  /** 0..1 - how "on" they are. Silent characters dim and stop moving. */
  energy?: number;
  size?: number;
  /** Show the name plate under them. */
  showName?: boolean;
};

export const Character: React.FC<CharacterProps> = ({
  look,
  side,
  words,
  accent,
  energy = 1,
  size = 300,
  showName = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const speaking = Boolean(words && words.length);
  const mouth = speaking ? mouthAt(words!, frame / fps, fps) : { open: 0, wide: 0 };

  // Blinks: one every ~3.4 s, per-character phase, closed for ~4 frames.
  const blinkPhase = (frame / fps + hash(look.id.length * 3.1) * 4) % 3.4;
  const blink = blinkPhase < 0.13 ? Math.sin((blinkPhase / 0.13) * Math.PI) : 0;

  // A slow bob while speaking, dead still while not.
  const bob = speaking ? Math.sin((frame / fps) * 2.6) * 3 * energy : 0;
  const lean = speaking ? Math.sin((frame / fps) * 1.3) * 1.6 * energy : 0;
  const brow = speaking ? Math.sin((frame / fps) * 3.1) * energy : 0;

  // They face the middle of the frame: the left character mirrors.
  const facing = side === "right" ? -1 : 1;
  const opacity = interpolate(energy, [0, 1], [0.42, 1]);

  return (
    <div
      style={{
        width: size,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity,
        transition: "opacity .2s",
      }}
    >
      <svg
        viewBox="-90 -110 180 260"
        width={size}
        height={(size * 260) / 180}
        style={{
          transform: `translateY(${bob}px) rotate(${lean * facing}deg)`,
          filter: speaking ? `drop-shadow(0 0 26px ${accent}55)` : "none",
        }}
      >
        {/* torso */}
        <path
          d={`M-56 200 v-58 a56 56 0 0 1 112 0 v58 z`}
          fill={look.shirt}
        />
        <path d="M-56 200 v-28 a56 40 0 0 0 112 0 v28 z" fill="#00000022" />
        <Hair look={look} phase={hash(frame * 0.01)} />
        <Face look={look} mouth={mouth} blink={blink} brow={brow} />
        <Accessory look={look} />
      </svg>
      {showName && (
        <span
          style={{
            marginTop: -6,
            padding: "4px 14px",
            borderRadius: 999,
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: 1.4,
            color: energy > 0.5 ? "#fff" : "rgba(255,255,255,.55)",
            background: energy > 0.5 ? `${accent}` : "rgba(255,255,255,.12)",
            border: `1px solid ${accent}aa`,
          }}
        >
          {look.name.toUpperCase()}
        </span>
      )}
    </div>
  );
};

/**
 * Two characters facing each other, with the one who is talking lit up.
 * Used by the `dialogue` scene mode.
 */
export const CharacterLineup: React.FC<{
  cast: CharacterLook[];
  activeIndex: number;
  words: WordTiming[] | null;
  accent: string;
  size?: number;
  height: number;
}> = ({ cast, activeIndex, words, accent, size = 260, height }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: Math.max(120, height * 0.16),
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-end",
      gap: size * 0.5,
    }}
  >
    {cast.map((look, i) => (
      <Character
        key={look.id + i}
        look={look}
        side={i === 0 ? "left" : "right"}
        words={i === activeIndex ? words : null}
        accent={i === activeIndex ? accent : "#8FA0C8"}
        energy={i === activeIndex ? 1 : 0.55}
        size={size}
      />
    ))}
  </div>
);
