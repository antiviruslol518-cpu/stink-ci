import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/stink/Bridge";

export const Root: React.FC = () => (
  <Composition
    id="MyShort"
    component={BridgeShort}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={BRIDGE_FRAMES}
  />
);
