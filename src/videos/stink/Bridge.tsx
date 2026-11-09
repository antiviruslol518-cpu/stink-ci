// "The Bridge That Fell for a Song": our original 67 s short in the flat-characters-in-a-3D-toon-world style.
// One three.js world (world.ts) posed per frame from the story timeline (story.ts). Post chain (look-match pass):
//   InkPass (world ink lines, own pass) -> lens blur pre + main (thin-lens DOF per shot from dofAt) ->
//   [bloom (emissive only) + NEUTRAL tone mapping + colour grade] (one merged EffectPass), MSAA 4.
// Ink runs before the DOF so lines blur with what they belong to; bloom after the DOF so glows defocus with their
// source; the grade is display-referred, so it comes after tone mapping. Every pixel-sized parameter is specified at
// 1080x1920 and scaled with the output size, so stills at --scale 0.5 and the 1440x2560 final match.
// Place changes crossfade by stacking a second canvas for the fade frames; the hook ends on a 4-frame white flash.
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World, loadKit } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur, GrainEffect } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { Kit } from "./build";
import { TOTAL, FLASH_AT, SHOTS, layersAt, dofAt } from "./story";

export const BRIDGE_FRAMES = TOTAL;

/** A/B switches for test stills only (Remotion inputProps `{ post: { ink: false, ... } }`); everything is on by default.
 *  `shadows` is here because the frame-601 banding is the signature of shadow-map acne on a grazing ground
 *  plane: turning the sun's shadow off is the one test that separates acne from a texture/mip problem. */
type PostToggles = { ink: boolean; lens: boolean; pre: boolean; bloom: boolean; grade: boolean; grain: boolean; shadows: boolean; cast: boolean; world: boolean; aniso: number; noMip: boolean; inkDebug: number; inkTerm: number };
const toggles = (): PostToggles => ({ ink: true, lens: true, pre: true, bloom: true, grade: true, grain: false, shadows: true, cast: true, world: true, aniso: 0, noMip: false, inkDebug: 0, inkTerm: 0, ...((getInputProps() as { post?: Partial<PostToggles> }).post ?? {}) });

/** Bloom for emissive sources only (depth.md 6.4). Its MIP chain always starts at 540x960 (half of 1080x1920),
 *  whatever the output size, so the glow keeps the same size relative to the frame (e-fold ~30 px at 1080p,
 *  ~1.5 % of the frame height) at 540, 1080 and 1440 widths. ADD blend: HDR-safe (SCREEN darkens values > 1). */
const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass;
  const setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
  return b;
};

const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const useKit = () => {
  const [kit, setKit] = useState<Kit | null>(null);
  const [handle] = useState(() => delayRender("bridge kit"));
  useEffect(() => { loadKit().then((k) => { setKit(k); continueRender(handle); }); }, [handle]);
  return kit;
};

const Inner: React.FC<{ id: number; kit: Kit }> = ({ id, kit }) => {
  const f = useCurrentFrame();
  const { camera, scene } = useThree();
  const on = useMemo(toggles, []);
  const world = useMemo(() => new World(kit, { shadows: on.shadows, cast: on.cast, aniso: on.aniso || undefined, noMip: on.noMip }), [kit, on]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const fx = useMemo(() => ({
    ink: (() => {
      const p = new InkPass(scene, camera as THREE.PerspectiveCamera);
      const cfg = (getInputProps() as { post?: { inkDebug?: number; inkTerm?: number } }).post;
      p.debug = cfg?.inkDebug ?? 0;
      p.term = cfg?.inkTerm ?? 0;
      // inkProbe: [x0, row0, x1, row1] in mask-target pixels, rows from the TOP.
      const pr = (cfg as { inkProbe?: number[] } | undefined)?.inkProbe;
      if (pr?.length === 4) p.probe = { x0: pr[0], row0: pr[1], x1: pr[2], row1: pr[3] };
      return p;
    })(),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    bloom: makeBloom(),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES.day, GRADE_STRENGTH.day),
    grain: new GrainEffect({ amount: 0.025, cellPx: 1.5 }), // film grain, OFF by default (inputProps post.grain): the reference measures no grain and it quadruples the file size
  }), [camera, scene]);
  // NOTE: never write `dispose={null}` on a <primitive>. R3F's diffProps only filters the
  // `object` key for primitives (events-*.esm.js:615), so `dispose` falls through to
  // applyProps and is assigned onto the instance as an own property — `fx.ink.dispose = null`
  // — which shadows the class's prototype dispose(). The crossfade unmounts then threw
  // "fx.ink.dispose is not a function" (frames 81/1153/1650/1756) and killed whole chunks.
  // The prop was redundant anyway: removeChild sets shouldDispose = !isPrimitive, so a
  // primitive is never auto-disposed. The explicit cleanup below is the only dispose path.
  useEffect(() => () => {
    // one failed dispose must not abort a two-hour chunk: the canvas is going away regardless,
    // so a leaked target here is harmless, while a thrown error is fatal to the whole render.
    try { fx.ink.dispose(); } catch (e) { console.warn("InkPass.dispose failed:", e); }
  }, [fx]);
  // EffectComposer types children as JSX.Element | JSX.Element[], so a conditional `null`
  // does not typecheck. Build the pass list as an array instead of null-gating inline.
  const post = useMemo(() => {
    const passes: JSX.Element[] = [];
    if (on.ink) passes.push(<primitive key="ink" object={fx.ink} />);
    if (on.lens && on.pre) passes.push(<primitive key="pre" object={fx.lens.pre} />);
    if (on.lens) passes.push(<primitive key="lens" object={fx.lens.main} />);
    if (on.bloom) passes.push(<primitive key="bloom" object={fx.bloom} />);
    passes.push(<primitive key="tone" object={fx.tone} />);
    if (on.grade) passes.push(<primitive key="grade" object={fx.grade} />);
    if (on.grain) passes.push(<primitive key="grain" object={fx.grain} />);
    return <EffectComposer multisampling={4}>{passes}</EffectComposer>;
  }, [fx, on]);
  const cam = camera as THREE.PerspectiveCamera;
  target.copy(world.update(id, f, cam, scene));
  noInkFallback(world.root);
  // thin-lens focus: distance along the view axis to the shot's focus point (default: the camera's look target)
  const d = dofAt(f);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus(f)); else fpt.copy(target);
  fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  fx.lens.cInf = d.cInf;
  gradeFor(fx.grade, SHOTS[id - 1].light);
  fx.grain.seed = f; // deterministic per frame
  return (
    <>
      {/* `world:false` hides the static set while leaving the cast, post chain and camera in place. The
          601 artifact survives every post pass being switched off, so the next question is whether it is
          the set at all: with the set hidden, the floor and the characters must both go, and whatever is
          still drawn is the thing drawing it. */}
      <primitive object={world.root} visible={on.world} />
      {post}
    </>
  );
};

/** test stills only: inputProps `{ post: { dpr: 0.5 } }` forces the WebGL buffer size (R3F clamps dpr to >= 1 by default) */
const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
const ShotView: React.FC<{ id: number; kit: Kit; alpha: number }> = ({ id, kit, alpha }) => (
  <AbsoluteFill style={{ opacity: alpha }}>
    <ThreeCanvas width={1080} height={1920} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows={toggles().shadows} gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
      camera={{ fov: 40, near: 0.2, far: 1500 }}>
      <Inner id={id} kit={kit} />
    </ThreeCanvas>
  </AbsoluteFill>
);

export const BridgeShort: React.FC = () => {
  const f = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const flash = f >= FLASH_AT && f < FLASH_AT + 4 ? [1, 0.75, 0.45, 0.2][f - FLASH_AT] : 0;
  return (
    <AbsoluteFill style={{ background: "#cfe3f2" }}>
      {layersAt(f).map((l, i) => <ShotView key={i ? "over" : "base"} id={l.id} kit={kit} alpha={l.alpha} />)}
      {flash > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: flash }} />}
    </AbsoluteFill>
  );
};
