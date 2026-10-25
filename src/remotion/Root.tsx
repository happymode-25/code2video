import { Composition } from "remotion";
import { demoProps } from "./demo";
import { Studio, timelineFor, type StudioProps } from "./Studio";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Studio"
        component={Studio}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={demoProps}
        // The script decides how long the video is, so probe it from the props.
        calculateMetadata={({ props }) => {
          const p = props as StudioProps;
          const timeline = timelineFor(p);
          return {
            durationInFrames: timeline.durationInFrames,
            fps: p.fps || 30,
            width: p.width || 1920,
            height: p.height || 1080,
            props: p,
          };
        }}
      />
    </>
  );
};
