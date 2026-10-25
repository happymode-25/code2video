import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/** Animation primitives shared by every block. Inline styles only - the Remotion
 *  bundle must not depend on Tailwind. */

export const usePop = (delay = 0, config?: Parameters<typeof spring>[0]["config"]) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.7, ...config } });
};

export const useProgress = (delay = 0, duration = 30) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

type BoxProps = {
  delay?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  from?: number;
  dir?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
};

export const Pop: React.FC<BoxProps> = ({ delay = 0, children, style, from = 0.7 }) => {
  const s = usePop(delay);
  return (
    <div style={{ transform: `scale(${from + s * (1 - from)})`, opacity: Math.min(1, Math.max(0, s)), ...style }}>
      {children}
    </div>
  );
};

export const Rise: React.FC<BoxProps> = ({ delay = 0, children, style, dir = "up", distance = 40 }) => {
  const s = usePop(delay);
  const dx = dir === "left" ? -distance : dir === "right" ? distance : 0;
  const dy = dir === "up" ? distance : dir === "down" ? -distance : 0;
  return (
    <div
      style={{
        transform: `translate(${dx * (1 - s)}px, ${dy * (1 - s)}px)`,
        opacity: Math.min(1, Math.max(0, s)),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Fade: React.FC<BoxProps> = ({ delay = 0, children, style }) => {
  const s = usePop(delay);
  return <div style={{ opacity: Math.min(1, Math.max(0, s)), ...style }}>{children}</div>;
};

export const Pulse: React.FC<BoxProps & { amount?: number; speed?: number }> = ({
  delay = 0,
  children,
  style,
  amount = 0.06,
  speed = 45,
}) => {
  const frame = useCurrentFrame();
  const t = Math.max(0, frame - delay);
  const k = 1 + Math.sin((t / speed) * Math.PI * 2) * amount;
  return <div style={{ transform: `scale(${k})`, ...style }}>{children}</div>;
};

/** Text that reveals word by word. */
export const KineticText: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  style?: React.CSSProperties;
  wordStyle?: React.CSSProperties;
}> = ({ text, delay = 0, stagger = 4, style, wordStyle }) => (
  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 22px", ...style }}>
    {text.split(" ").map((w, i) => (
      <Pop key={i} delay={delay + i * stagger} from={0.6} style={wordStyle}>
        <span>{w}</span>
      </Pop>
    ))}
  </div>
);
