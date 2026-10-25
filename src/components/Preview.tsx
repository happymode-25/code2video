"use client";

import { Player } from "@remotion/player";
import React, { useMemo } from "react";
import { Studio, type StudioProps } from "@/remotion/Studio";
import { buildTimeline } from "@/lib/video/timeline";

/**
 * The live preview. This is the pay-off of the whole design: the exact same
 * component the renderer uses, driven by the props the editor is holding -
 * so what you see here is what the MP4 will be.
 */
export function Preview({
  props,
  className,
}: {
  props: StudioProps;
  className?: string;
}) {
  const timeline = useMemo(
    () => buildTimeline({ fps: props.fps, gap: props.gap, captions: props.captions, scenes: props.scenes }, props.narration),
    [props],
  );

  return (
    <div className={className}>
      <Player
        component={Studio}
        inputProps={props}
        durationInFrames={timeline.durationInFrames}
        fps={props.fps}
        compositionWidth={props.width}
        compositionHeight={props.height}
        style={{ width: "100%", aspectRatio: `${props.width} / ${props.height}`, borderRadius: 14 }}
        controls
        clickToPlay
        doubleClickToFullscreen
        acknowledgeRemotionLicense
      />
    </div>
  );
}
