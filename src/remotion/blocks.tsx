import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { Block, SceneSpec, ThemeSpec } from "../lib/engine/types";
import { Fade, KineticText, Pop, Pulse, Rise, usePop } from "./anim";
import { Badge, isLight } from "./chrome";

/**
 * The block library. A script composes these; the composition lays them out.
 * Every block receives a `delay` (frames) and animates from there.
 */

type Ctx = { theme: ThemeSpec; accent: string; dur: number; delay: number };

const panelStyle = (theme: ThemeSpec): React.CSSProperties => ({
  background: isLight(theme) ? "rgba(255,255,255,.75)" : "rgba(8,12,28,.72)",
  border: `1px solid ${isLight(theme) ? "rgba(0,0,0,.10)" : "rgba(255,255,255,.10)"}`,
  borderRadius: 20,
  padding: "26px 32px",
  boxShadow: isLight(theme) ? "0 18px 40px rgba(20,30,60,.10)" : "0 24px 60px rgba(0,0,0,.45)",
  backdropFilter: "blur(6px)",
});

const colorFor = (theme: ThemeSpec, i: number): string =>
  theme.palette[i % theme.palette.length] ?? theme.accent;

/* -------------------------------------------------------------------- title */

const TitleBlock: React.FC<Ctx & { block: Extract<Block, { type: "title" }> }> = ({ block, delay, theme }) => (
  <div style={{ textAlign: "center" }}>
    <KineticText
      text={block.text}
      delay={delay}
      style={{ fontSize: 92, fontWeight: 900, letterSpacing: -1, color: theme.ink, lineHeight: 1.08 }}
      wordStyle={{ textShadow: isLight(theme) ? "none" : "0 6px 26px rgba(0,0,0,.55)" }}
    />
    {block.sub && (
      <Fade delay={delay + 16}>
        <div style={{ marginTop: 20, fontSize: 36, fontWeight: 600, color: theme.muted, letterSpacing: 0.5 }}>
          {block.sub}
        </div>
      </Fade>
    )}
  </div>
);

/* ------------------------------------------------------------------ bullets */

const BulletsBlock: React.FC<Ctx & { block: Extract<Block, { type: "bullets" }> }> = ({
  block,
  delay,
  theme,
  accent,
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20, width: 1280, maxWidth: "100%" }}>
    {block.heading && (
      <Fade delay={delay}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: accent, textTransform: "uppercase" }}>
          {block.heading}
        </div>
      </Fade>
    )}
    {block.items.map((item, i) => (
      <Rise key={i} delay={delay + 6 + i * 9} dir="left" distance={70}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, ...panelStyle(theme), padding: "18px 26px" }}>
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              background: colorFor(theme, i),
              boxShadow: `0 0 18px ${colorFor(theme, i)}`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 40, fontWeight: 700, color: theme.ink }}>{item}</span>
        </div>
      </Rise>
    ))}
  </div>
);

/* -------------------------------------------------------------------- cards */

const CardsBlock: React.FC<Ctx & { block: Extract<Block, { type: "cards" }> }> = ({ block, delay, theme }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
    {block.heading && (
      <Fade delay={delay}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: theme.accent, textTransform: "uppercase" }}>
          {block.heading}
        </div>
      </Fade>
    )}
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 22, maxWidth: 1420 }}>
      {block.items.map((card, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Badge label={card.label} sub={card.value} color={colorFor(theme, i)} delay={delay + i * 8} />
          {card.hint && (
            <Fade delay={delay + i * 8 + 10}>
              <div style={{ fontSize: 22, color: theme.muted, fontWeight: 600 }}>{card.hint}</div>
            </Fade>
          )}
        </div>
      ))}
    </div>
  </div>
);

/* -------------------------------------------------------------------- stack */

const StackBar: React.FC<{
  label: string;
  color: string;
  hot: boolean;
  barH: number;
  delay: number;
}> = ({ label, color, hot, barH, delay }) => {
  const s = usePop(delay);
  return (
    <div
      style={{
        height: barH,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 20px",
        borderRadius: 12,
        background: `linear-gradient(90deg, ${color} 0%, ${color}dd 60%, ${color}aa 100%)`,
        boxShadow: hot
          ? `0 0 40px ${color}, 0 0 90px ${color}66, inset 0 2px 0 rgba(255,255,255,.45)`
          : `0 8px 26px rgba(0,0,0,.45), inset 0 2px 0 rgba(255,255,255,.35)`,
        transform: `translateY(${(1 - s) * -160}px) scale(${0.9 + s * 0.1})`,
        opacity: s,
      }}
    >
      <div style={{ color: "#fff", fontSize: 32, fontWeight: 800, letterSpacing: 0.5, flex: 1, textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
        {label}
      </div>
    </div>
  );
};

const StackBlock: React.FC<Ctx & { block: Extract<Block, { type: "stack" }> }> = ({ block, delay, theme }) => {
  const rows = block.layers.length;
  const barH = Math.max(44, Math.min(88, Math.floor(620 / Math.max(1, rows))));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      {block.heading && (
        <Fade delay={delay}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: theme.accent, textTransform: "uppercase" }}>
            {block.heading}
          </div>
        </Fade>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 900 }}>
        {block.layers.map((layer, i) => (
          <StackBar
            key={i}
            label={layer.label}
            color={layer.color ?? colorFor(theme, i)}
            hot={block.highlight !== undefined && block.highlight === i + 1}
            barH={barH}
            delay={delay + i * 6}
          />
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------- steps */

const StepsBlock: React.FC<Ctx & { block: Extract<Block, { type: "steps" }> }> = ({ block, delay, theme }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
    {block.heading && (
      <Fade delay={delay}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: theme.accent, textTransform: "uppercase" }}>
          {block.heading}
        </div>
      </Fade>
    )}
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, flexWrap: "wrap", justifyContent: "center" }}>
      {block.items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <Fade delay={delay + i * 11 - 3}>
              <div style={{ width: 70, height: 4, background: theme.dim, marginTop: 40 }} />
            </Fade>
          )}
          <Rise delay={delay + i * 11} dir="up" distance={50}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 230 }}>
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 999,
                  background: `radial-gradient(circle at 35% 30%, ${colorFor(theme, i)}, ${colorFor(theme, i)}aa)`,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 38,
                  fontWeight: 900,
                  boxShadow: `0 0 34px ${colorFor(theme, i)}66`,
                }}
              >
                {i + 1}
              </div>
              <div style={{ marginTop: 16, fontSize: 26, fontWeight: 700, color: theme.ink, textAlign: "center" }}>
                {item}
              </div>
            </div>
          </Rise>
        </React.Fragment>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ compare */

const CompareBlock: React.FC<Ctx & { block: Extract<Block, { type: "compare" }> }> = ({ block, delay, theme }) => {
  const side = (
    s: { title: string; items: string[] },
    color: string,
    d: number,
    dir: "left" | "right",
  ) => (
    <Rise delay={d} dir={dir} distance={80}>
      <div style={{ ...panelStyle(theme), width: 600, borderTop: `4px solid ${color}` }}>
        <div style={{ fontSize: 34, fontWeight: 900, color, marginBottom: 16 }}>{s.title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {s.items.map((item, i) => (
            <Fade key={i} delay={d + 8 + i * 7}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
                <span style={{ fontSize: 30, fontWeight: 600, color: theme.ink }}>{item}</span>
              </div>
            </Fade>
          ))}
        </div>
      </div>
    </Rise>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
      {block.heading && (
        <Fade delay={delay}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: theme.accent, textTransform: "uppercase" }}>
            {block.heading}
          </div>
        </Fade>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
        {side(block.left, theme.good, delay + 4, "left")}
        <Pop delay={delay + 16} from={0.5}>
          <div style={{ fontSize: 30, fontWeight: 900, color: theme.muted }}>VS</div>
        </Pop>
        {side(block.right, theme.warn, delay + 10, "right")}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------- mnemonic */

const MnemonicBlock: React.FC<Ctx & { block: Extract<Block, { type: "mnemonic" }> }> = ({ block, delay, theme }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
    <KineticText
      text={block.phrase}
      delay={delay}
      stagger={7}
      style={{ fontSize: 84, fontWeight: 900, color: theme.ink, textAlign: "center", lineHeight: 1.1 }}
    />
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, maxWidth: 1500 }}>
      {block.expansion.map((word, i) => (
        <Pop key={i} delay={delay + 24 + i * 5} from={0.6}>
          <div
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              background: `${colorFor(theme, i)}22`,
              border: `1px solid ${colorFor(theme, i)}`,
              color: colorFor(theme, i),
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            {word}
          </div>
        </Pop>
      ))}
    </div>
  </div>
);

/* ----------------------------------------------------------------------- code */

const Typed: React.FC<{ text: string; delay: number; dur: number; style: React.CSSProperties }> = ({
  text,
  delay,
  dur,
  style,
}) => {
  const frame = useCurrentFrame();
  const span = Math.max(1, dur * 0.55);
  const chars = Math.round(Math.max(0, Math.min(1, (frame - delay) / span)) * text.length);
  if (frame < delay) return <pre style={{ ...style, opacity: 0 }}>{text}</pre>;
  return (
    <pre style={style}>
      {text.slice(0, chars)}
      <span style={{ opacity: chars < text.length ? 0.9 : 0 }}>▍</span>
    </pre>
  );
};

const CodeBlock: React.FC<Ctx & { block: Extract<Block, { type: "code" }> }> = ({ block, delay, theme, dur }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: 1400 }}>
    {block.heading && (
      <Fade delay={delay}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4, color: theme.accent, textTransform: "uppercase" }}>
          {block.heading}
        </div>
      </Fade>
    )}
    <Pop delay={delay} from={0.94} style={{ width: "100%" }}>
      <div
        style={{
          background: isLight(theme) ? "#0f172a" : "#070b18",
          border: `1px solid ${theme.accent}44`,
          borderRadius: 18,
          padding: "26px 30px",
          boxShadow: `0 24px 60px rgba(0,0,0,.5), inset 0 0 40px ${theme.accent}12`,
          width: "100%",
          maxHeight: 620,
          overflow: "hidden",
        }}
      >
        <Typed
          text={block.code}
          delay={delay + 4}
          dur={dur}
          style={{
            margin: 0,
            color: "#dbe6ff",
            fontFamily: '"Cascadia Code", Consolas, ui-monospace, monospace',
            fontSize: 30,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        />
      </div>
    </Pop>
  </div>
);

/* --------------------------------------------------------------------- outro */

const OutroBlock: React.FC<Ctx & { block: Extract<Block, { type: "outro" }> }> = ({ block, delay, theme, accent }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
    <KineticText
      text={block.text}
      delay={delay}
      style={{ fontSize: 88, fontWeight: 900, color: theme.ink, textAlign: "center", lineHeight: 1.1 }}
    />
    {block.sub && (
      <Fade delay={delay + 18}>
        <div style={{ fontSize: 36, fontWeight: 600, color: theme.muted }}>{block.sub}</div>
      </Fade>
    )}
    <Pop delay={delay + 26}>
      <Pulse delay={delay + 30} amount={0.03}>
        <div
          style={{
            marginTop: 10,
            padding: "16px 42px",
            borderRadius: 999,
            background: `linear-gradient(90deg, ${accent}, ${accent}bb)`,
            color: "#04101c",
            fontSize: 34,
            fontWeight: 900,
            letterSpacing: 1,
            boxShadow: `0 0 50px ${accent}66`,
          }}
        >
          SUBSCRIBE FOR MORE
        </div>
      </Pulse>
    </Pop>
  </div>
);

/* -------------------------------------------------------------------- quote */

const QuoteBlock: React.FC<Ctx & { block: Extract<Block, { type: "quote" }> }> = ({ block, delay, theme, accent }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 1320, maxWidth: "100%" }}>
    <Fade delay={delay}>
      <div style={{ fontSize: 120, lineHeight: 0.6, color: accent, opacity: 0.5, fontWeight: 900 }}>“</div>
    </Fade>
    <div style={{ maxWidth: 1180, textAlign: "center", marginTop: 18 }}>
      <KineticText
        text={block.text}
        delay={delay + 6}
        stagger={3}
        style={{
          fontSize: 54,
          fontWeight: 600,
          fontStyle: "italic",
          lineHeight: 1.32,
          color: theme.ink,
          letterSpacing: 0.4,
        }}
      />
    </div>
    {(block.who || block.source) && (
      <Fade delay={delay + 20}>
        <div style={{ marginTop: 34, textAlign: "center" }}>
          {block.who && <div style={{ fontSize: 30, fontWeight: 800, color: accent }}>— {block.who}</div>}
          {block.source && <div style={{ marginTop: 6, fontSize: 22, color: theme.muted, fontWeight: 600 }}>{block.source}</div>}
        </div>
      </Fade>
    )}
  </div>
);

/* ------------------------------------------------------------------ callout */

const CALLOUT: Record<NonNullable<Extract<Block, { type: "callout" }>["kind"]>, { icon: string; color: string }> = {
  note: { icon: "✎", color: "#3498DB" },
  tip: { icon: "✦", color: "#1ABC9C" },
  warning: { icon: "!", color: "#F1C40F" },
  danger: { icon: "!", color: "#E74C3C" },
  key: { icon: "★", color: "#9B59B6" },
};

const CalloutBlock: React.FC<Ctx & { block: Extract<Block, { type: "callout" }> }> = ({ block, delay, theme }) => {
  const kind = CALLOUT[block.kind ?? "note"];
  return (
    <Rise delay={delay} dir="up" distance={40}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 26,
          width: 1240,
          maxWidth: "100%",
          padding: "30px 36px",
          borderRadius: 20,
          background: `linear-gradient(90deg, ${kind.color}22, ${kind.color}0d)`,
          border: `2px solid ${kind.color}`,
          borderLeft: `12px solid ${kind.color}`,
          boxShadow: `0 24px 60px rgba(0,0,0,.45), 0 0 60px ${kind.color}33`,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            flexShrink: 0,
            borderRadius: 16,
            background: kind.color,
            color: "#08101f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 40,
            fontWeight: 900,
          }}
        >
          {kind.icon}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {block.title && (
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 1.5, color: kind.color, textTransform: "uppercase" }}>
              {block.title}
            </div>
          )}
          <div style={{ fontSize: 38, fontWeight: 600, color: theme.ink, lineHeight: 1.34 }}>{block.text}</div>
        </div>
      </div>
    </Rise>
  );
};

/* ----------------------------------------------------------------- timeline */

const TimelineBlock: React.FC<Ctx & { block: Extract<Block, { type: "timeline" }> }> = ({ block, delay, theme }) => {
  const entries = block.entries.slice(0, 6);
  const vertical = entries.length > 4;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
      {block.heading && (
        <Fade delay={delay}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: theme.accent, textTransform: "uppercase" }}>
            {block.heading}
          </div>
        </Fade>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          alignItems: vertical ? "stretch" : "flex-start",
          justifyContent: "center",
          gap: vertical ? 18 : 0,
          maxWidth: 1400,
        }}
      >
        {entries.map((entry, i) => (
          <React.Fragment key={i}>
            {vertical ? (
              <Rise delay={delay + i * 10} dir="left" distance={60}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ width: 200, textAlign: "right", fontSize: 30, fontWeight: 900, color: colorFor(theme, i) }}>
                    {entry.when}
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: 999, background: colorFor(theme, i), boxShadow: `0 0 20px ${colorFor(theme, i)}`, flexShrink: 0 }} />
                  <div style={{ ...panelStyle(theme), padding: "14px 24px", minWidth: 720 }}>
                    <div style={{ fontSize: 30, fontWeight: 700, color: theme.ink }}>{entry.what}</div>
                    {entry.note && <div style={{ marginTop: 4, fontSize: 22, color: theme.muted }}>{entry.note}</div>}
                  </div>
                </div>
              </Rise>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                {i > 0 && (
                  <Fade delay={delay + i * 10 - 3}>
                    <div style={{ width: 60, height: 4, background: theme.dim, marginTop: 66 }} />
                  </Fade>
                )}
                <Rise delay={delay + i * 10} dir="up" distance={50}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 260 }}>
                    <div style={{ height: 44, fontSize: 30, fontWeight: 900, color: colorFor(theme, i), textAlign: "center" }}>{entry.when}</div>
                    <div style={{ width: 22, height: 22, borderRadius: 999, background: colorFor(theme, i), boxShadow: `0 0 22px ${colorFor(theme, i)}` }} />
                    <div style={{ width: 4, height: 30, background: theme.dim }} />
                    <div style={{ padding: "0 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: theme.ink }}>{entry.what}</div>
                      {entry.note && <div style={{ marginTop: 6, fontSize: 21, color: theme.muted }}>{entry.note}</div>}
                    </div>
                  </div>
                </Rise>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------- table */

const TableBlock: React.FC<Ctx & { block: Extract<Block, { type: "table" }> }> = ({ block, delay, theme, accent }) => {
  const rows = block.data.rows.slice(0, 8);
  const cell = (text: string, head: boolean, i: number, hi: boolean): React.CSSProperties => ({
    padding: head ? "18px 24px" : "16px 24px",
    fontSize: head ? 27 : 30,
    fontWeight: head ? 900 : 600,
    letterSpacing: head ? 1.2 : 0,
    color: head ? "#fff" : theme.ink,
    textAlign: "left",
    background: head
      ? `linear-gradient(90deg, ${accent}, ${accent}bb)`
      : hi
        ? `${colorFor(theme, i)}26`
        : "transparent",
    borderBottom: `1px solid ${isLight(theme) ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.08)"}`,
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, width: 1380, maxWidth: "100%" }}>
      {block.heading && (
        <Fade delay={delay}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: accent, textTransform: "uppercase" }}>
            {block.heading}
          </div>
        </Fade>
      )}
      <Fade delay={delay + 6} style={{ width: "100%" }}>
        <div style={{ ...panelStyle(theme), padding: 0, overflow: "hidden", width: "100%" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {block.data.columns.map((c, i) => (
                  <th key={i} style={cell(c, true, i, false)}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, i) => (
                    <td key={i} style={cell(c, false, r, block.highlight === r + 1)}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Fade>
    </div>
  );
};

/* ------------------------------------------------------------------ diagram */

const DiagramBlock: React.FC<Ctx & { block: Extract<Block, { type: "diagram" }> }> = ({ block, delay, theme, accent }) => {
  const nodes = block.nodes.slice(0, 8);
  const edges = (block.edges ?? []).filter(
    (e) => nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to),
  );
  // Lay the nodes out in a single row; boxes are wide enough that labels fit.
  const boxW = Math.min(240, Math.floor(1300 / Math.max(1, nodes.length)) - 24);
  const boxH = 130;
  const gap = 60;
  const totalW = nodes.length * boxW + Math.max(0, nodes.length - 1) * gap;
  const pad = 60;
  const at = (id: string) => nodes.findIndex((n) => n.id === id);
  const xOf = (i: number) => pad + i * (boxW + gap) + boxW / 2;
  const yOf = () => pad + boxH / 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
      {block.heading && (
        <Fade delay={delay}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: accent, textTransform: "uppercase" }}>
            {block.heading}
          </div>
        </Fade>
      )}
      <Fade delay={delay + 6}>
        <svg width={totalW + pad * 2} height={boxH + pad * 2} style={{ overflow: "visible" }}>
          <defs>
            <marker id="c2v-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
              <path d="M0 0 L12 6 L0 12 z" fill={accent} />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const from = at(e.from);
            const to = at(e.to);
            if (from < 0 || to < 0) return null;
            const x1 = xOf(from) + (to > from ? boxW / 2 : -boxW / 2);
            const x2 = xOf(to) + (to > from ? -boxW / 2 : boxW / 2);
            const y = yOf();
            const mx = (x1 + x2) / 2;
            return (
              <g key={i}>
                <line x1={x1} y1={y} x2={x2} y2={y} stroke={accent} strokeWidth={4} markerEnd="url(#c2v-arrow)" opacity={0.9} />
                {e.label && (
                  <text x={mx} y={y - 14} fill={theme.muted} fontSize={22} fontWeight={700} textAnchor="middle">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {nodes.map((n, i) => (
            <g key={n.id}>
              <rect
                x={xOf(i) - boxW / 2}
                y={yOf() - boxH / 2}
                width={boxW}
                height={boxH}
                rx={18}
                fill={n.color ?? colorFor(theme, i)}
                stroke="rgba(255,255,255,.35)"
                strokeWidth={2}
              />
              <text x={xOf(i)} y={yOf() + (n.sub ? -4 : 8)} fill="#fff" fontSize={26} fontWeight={800} textAnchor="middle">
                {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
              </text>
              {n.sub && (
                <text x={xOf(i)} y={yOf() + 26} fill="rgba(255,255,255,.85)" fontSize={19} fontWeight={600} textAnchor="middle">
                  {n.sub}
                </text>
              )}
            </g>
          ))}
        </svg>
      </Fade>
    </div>
  );
};

/* ------------------------------------------------------------------ chapter */

const ChapterBlock: React.FC<Ctx & { block: Extract<Block, { type: "chapter" }> }> = ({ block, delay, theme, accent }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
    {block.number && (
      <Pop delay={delay} from={0.5}>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 8, color: accent, textTransform: "uppercase" }}>
          {block.number}
        </div>
      </Pop>
    )}
    <KineticText
      text={block.title}
      delay={delay + 6}
      style={{ fontSize: 84, fontWeight: 900, letterSpacing: -0.5, color: theme.ink, lineHeight: 1.1 }}
    />
    <Fade delay={delay + 22}>
      <div style={{ width: 220, height: 8, borderRadius: 999, background: `linear-gradient(90deg, ${accent}, ${colorFor(theme, 1)})` }} />
    </Fade>
    {block.sub && (
      <Fade delay={delay + 28}>
        <div style={{ marginTop: 6, fontSize: 34, fontWeight: 600, color: theme.muted }}>{block.sub}</div>
      </Fade>
    )}
  </div>
);

/* --------------------------------------------------------------------- stat */

const StatBlock: React.FC<Ctx & { block: Extract<Block, { type: "stat" }> }> = ({ block, delay, theme }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
    {block.heading && (
      <Fade delay={delay}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: theme.accent, textTransform: "uppercase" }}>
          {block.heading}
        </div>
      </Fade>
    )}
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 28, maxWidth: 1420 }}>
      {block.items.map((item, i) => (
        <Pop key={i} delay={delay + i * 10}>
          <div
            style={{
              minWidth: 300,
              padding: "28px 36px",
              borderRadius: 20,
              textAlign: "center",
              background: `linear-gradient(160deg, ${colorFor(theme, i)}26, transparent)`,
              border: `2px solid ${colorFor(theme, i)}`,
              boxShadow: `0 20px 50px rgba(0,0,0,.4)`,
            }}
          >
            <div style={{ fontSize: 76, fontWeight: 900, color: colorFor(theme, i), lineHeight: 1 }}>{item.value ?? item.label}</div>
            <div style={{ marginTop: 10, fontSize: 26, fontWeight: 700, color: theme.ink, letterSpacing: 0.6 }}>{item.value ? item.label : item.hint}</div>
            {item.value && item.hint && <div style={{ marginTop: 6, fontSize: 21, color: theme.muted }}>{item.hint}</div>}
          </div>
        </Pop>
      ))}
    </div>
    {block.note && (
      <Fade delay={delay + block.items.length * 10 + 8}>
        <div style={{ fontSize: 22, color: theme.muted, fontWeight: 600 }}>{block.note}</div>
      </Fade>
    )}
  </div>
);

/* ---------------------------------------------------------------- keypoints */

const KeyPointsBlock: React.FC<Ctx & { block: Extract<Block, { type: "keypoints" }> }> = ({ block, delay, theme, accent }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: 1300, maxWidth: "100%" }}>
    {block.heading && (
      <Fade delay={delay}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: accent, textTransform: "uppercase" }}>
          {block.heading}
        </div>
      </Fade>
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
      {block.items.map((item, i) => (
        <Rise key={i} delay={delay + 6 + i * 8} dir="left" distance={60}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, ...panelStyle(theme), padding: "16px 26px" }}>
            <span
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: 12,
                background: colorFor(theme, i),
                color: "#08101f",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                fontWeight: 900,
              }}
            >
              ✓
            </span>
            <span style={{ fontSize: 36, fontWeight: 700, color: theme.ink }}>{item}</span>
          </div>
        </Rise>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------- layout */

function BlockView({
  block,
  ctx,
}: {
  block: Block;
  ctx: Ctx;
}) {
  switch (block.type) {
    case "title":
      return <TitleBlock block={block} {...ctx} />;
    case "bullets":
      return <BulletsBlock block={block} {...ctx} />;
    case "cards":
      return <CardsBlock block={block} {...ctx} />;
    case "stack":
      return <StackBlock block={block} {...ctx} />;
    case "steps":
      return <StepsBlock block={block} {...ctx} />;
    case "compare":
      return <CompareBlock block={block} {...ctx} />;
    case "mnemonic":
      return <MnemonicBlock block={block} {...ctx} />;
    case "code":
      return <CodeBlock block={block} {...ctx} />;
    case "outro":
      return <OutroBlock block={block} {...ctx} />;
    case "quote":
      return <QuoteBlock block={block} {...ctx} />;
    case "callout":
      return <CalloutBlock block={block} {...ctx} />;
    case "timeline":
      return <TimelineBlock block={block} {...ctx} />;
    case "table":
      return <TableBlock block={block} {...ctx} />;
    case "diagram":
      return <DiagramBlock block={block} {...ctx} />;
    case "chapter":
      return <ChapterBlock block={block} {...ctx} />;
    case "stat":
      return <StatBlock block={block} {...ctx} />;
    case "keypoints":
      return <KeyPointsBlock block={block} {...ctx} />;
    default:
      return null;
  }
}

/** Renders every block of a scene, staggered across the first half of the scene. */
export const SceneBody: React.FC<{
  scene: SceneSpec;
  theme: ThemeSpec;
  accent: string;
  durationFrames: number;
  /** How much room the stage takes, so blocks and characters do not collide. */
  inset?: "board" | "character" | "dialogue";
}> = ({ scene, theme, accent, durationFrames, inset = "board" }) => {
  const n = Math.max(1, scene.blocks.length);
  const window = Math.max(0, durationFrames * 0.5 - 8);
  // A character on the right takes ~360px; a two-hander along the bottom takes
  // ~500px. Blocks are pushed clear of both and scaled down to keep fitting.
  const padding =
    inset === "dialogue"
      ? "120px 160px 560px"
      : inset === "character"
        ? "130px 150px 150px 130px"
        : "150px 120px 220px";
  const scale = inset === "dialogue" ? 0.82 : inset === "character" ? 0.92 : 1;
  return (
    <AbsoluteFill
      style={{
        padding,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30,
          transform: `scale(${scale})`,
          maxWidth: inset === "character" ? "64%" : "100%",
        }}
      >
        {scene.blocks.map((block, i) => (
          <BlockView
            key={i}
            block={block}
            ctx={{ theme, accent, dur: durationFrames, delay: Math.round(8 + (window * i) / n) }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
