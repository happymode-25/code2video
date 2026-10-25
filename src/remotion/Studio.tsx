import React, { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame } from "remotion";
import type { CharacterLook } from "../lib/engine/cast";
import type { CaptionOptions, Narration, SceneSpec, ThemeSpec } from "../lib/engine/types";
import { buildTimeline, type SceneTiming } from "../lib/video/timeline";
import { SceneBody } from "./blocks";
import { Character, CharacterLineup } from "./characters";
import { Background, Banner, Captions, SceneChip, SpeakerTag } from "./chrome";
import { voiceColor, voiceLabel } from "../lib/engine/voices";
import { resolveCast } from "../lib/engine/cast";

/** Everything the composition needs. Serialisable - it travels as inputProps. */
export type StudioProps = {
  fps: number;
  width: number;
  height: number;
  gap: number;
  theme: ThemeSpec;
  captions: CaptionOptions;
  scenes: SceneSpec[];
  narration: Narration | null;
  /** Characters referenced by scene `speaker`/`listener`. */
  cast?: CharacterLook[];
};

/** The banner repeats the scene's own takeaway line, if it has one. */
function taglineFor(scene: SceneSpec): string | undefined {
  for (const block of scene.blocks) {
    if (block.type === "title" && block.sub) return block.sub;
    if (block.type === "outro" && block.sub) return block.sub;
  }
  return undefined;
}

const SceneShell: React.FC<{
  timing: SceneTiming;
  theme: ThemeSpec;
  total: number;
  withGap: boolean;
  cast?: CharacterLook[];
}> = ({ timing, theme, total, withGap, cast }) => {
  const frame = useCurrentFrame();
  const scene = timing.scene;
  const accent = scene.accent || theme.accent;
  // This shell now runs until the *next* scene starts, so it has to hold its
  // last frame still, then dip to the background for the gap. Otherwise the
  // gap would show nothing at all.
  const hold = timing.durationFrames;
  const alpha = withGap
    ? interpolate(frame, [0, 10, hold, hold + 8], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : interpolate(frame, [0, 10, hold - 12, hold - 2], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
  // The chip counts scenes, so it leaves with the scene rather than lingering.
  const chip = interpolate(frame, [0, 10, hold - 6, hold + 2], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tagline = taglineFor(scene);
  const speaker = timing.nar ? voiceLabel(timing.voiceId) : null;

  // Staging: a scene can put one or two cast members on screen. Blocks sit
  // above them for `dialogue`, beside them for `character`.
  const looks = useMemo(() => {
    const first = resolveCast(cast, scene.speaker);
    const second = resolveCast(cast, scene.listener);
    return [first, second].filter(Boolean) as CharacterLook[];
  }, [cast, scene.speaker, scene.listener]);
  const onBoard = scene.mode === "board" || !looks.length;
  const words = timing.nar?.words ?? null;
  const twoHanded = scene.mode === "dialogue" && looks.length > 1;

  return (
    <>
      <AbsoluteFill style={{ opacity: alpha }}>
        <Background theme={theme} tint={accent} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: chip }}>
        <SceneChip
          n={timing.index + 1}
          total={total}
          color={accent}
          label={scene.title}
          theme={theme}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: alpha }}>
        {twoHanded && (
          <CharacterLineup cast={looks} activeIndex={0} words={words} accent={accent} height={1080} size={250} />
        )}
        <SceneBody
          scene={scene}
          theme={theme}
          accent={accent}
          durationFrames={hold}
          // When a character is on stage the blocks move up and shrink a little
          // so the two never fight for the same pixels.
          inset={onBoard ? "board" : twoHanded ? "dialogue" : "character"}
        />
        {!onBoard && !twoHanded && looks[0] && (
          <div style={{ position: "absolute", right: 90, bottom: 130, display: "flex", justifyContent: "flex-end" }}>
            <Character
              look={looks[0]}
              side="right"
              words={words}
              accent={accent}
              size={looks[0].build === "broad" ? 300 : 280}
            />
          </div>
        )}
        {tagline && onBoard && (
          <Banner
            theme={theme}
            color={accent}
            title={scene.title.toUpperCase()}
            sub={tagline}
            delay={Math.round(hold * 0.8)}
          />
        )}
        {speaker && <SpeakerTag name={speaker} color={voiceColor(timing.voiceId)} theme={theme} />}
      </AbsoluteFill>
      {timing.nar && (
        <Sequence from={0} durationInFrames={hold} layout="none">
          <Audio src={timing.nar.wav} />
        </Sequence>
      )}
    </>
  );
};

export const Studio: React.FC<StudioProps> = ({ fps, gap, theme, captions, scenes, narration, cast }) => {
  const timeline = useMemo(
    () => buildTimeline({ fps, gap, captions, scenes }, narration),
    [fps, gap, captions, scenes, narration],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: theme.deep }}>
      {timeline.scenes.map((timing, i) => {
        // Each scene owns its trailing gap, so the voice track can be trimmed
        // and dipped without cutting into the next scene's audio (Remotion
        // otherwise crossfades every Audio tag in the composition).
        const next = timeline.scenes[i + 1];
        const withGap = next !== undefined;
        const gapFrames = withGap ? Math.max(0, next.startFrame - timing.durationFrames - timing.startFrame) : 0;
        return (
          <Sequence
            key={`${timing.scene.id}-${timing.index}`}
            from={timing.startFrame}
            durationInFrames={timing.durationFrames + gapFrames}
            name={`${timing.scene.id} ${timing.scene.title}`}
          >
            <SceneShell timing={timing} theme={theme} total={timeline.scenes.length} withGap={withGap} cast={cast} />
          </Sequence>
        );
      })}
      <Captions chunks={timeline.captions} opts={captions} theme={theme} />
    </AbsoluteFill>
  );
};

/** Used by calculateMetadata and by the editor to show total length. */
export function timelineFor(props: StudioProps) {
  return buildTimeline(
    { fps: props.fps, gap: props.gap, captions: props.captions, scenes: props.scenes },
    props.narration,
  );
}
