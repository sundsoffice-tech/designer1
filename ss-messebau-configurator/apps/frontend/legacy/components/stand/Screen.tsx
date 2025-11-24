import { useCallback, useEffect, useRef, useState } from "react";
import { Detailed, Html, useVideoTexture } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ColliderType } from "../../types/modules";
import { TransformableObject, type TransformableObjectProps } from "./TransformableObject";
import { DEFAULT_LOD_DISTANCES } from "../../config/lod";
import { SELECTION_OUTLINE_COLOR } from "../../config/selection";
import type { RapierRigidBody } from "@react-three/rapier";

type DetailLevel = "high" | "medium" | "low";

type ScreenControls = Pick<
  TransformableObjectProps,
  "enabled" | "mode" | "snap" | "gridSize" | "showX" | "showY" | "showZ"
>;

export type Screen3DProps = {
  id: string;
  dims: { w: number; h: number; t: number };
  mount: "wall" | "floor" | "truss";
  position: [number, number, number];
  rotationY?: number;
  heightFromFloor: number;
  videoSrc?: string;
  selected?: boolean;
  colliding?: boolean;
  impacting?: boolean;
  collisionClearance?: number;
  collider?: ColliderType;
  controls: ScreenControls;
  onChange?: TransformableObjectProps["onChange"];
  onTransform?: TransformableObjectProps["onTransform"];
  onDragStart?: TransformableObjectProps["onDragStart"];
  onDragEnd?: TransformableObjectProps["onDragEnd"];
  onCollisionChange?: (colliding: boolean) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu?: (e: ThreeEvent<MouseEvent>) => void;
  onDoubleClick?: (e: ThreeEvent<MouseEvent>) => void;
  onBoundsChange?: TransformableObjectProps["onBoundsChange"];
};

const VIDEO_MAX_LOD_LEVEL = 1;
const DEFAULT_VOLUME = 0.75;

function useScreenVideoTexture(src: string | undefined, shouldPlay: boolean, muted: boolean, volume: number) {
  const resolvedSrc = src || "/media/screen-placeholder.mp4";
  const videoTexture = useVideoTexture(resolvedSrc, {
    crossOrigin: "anonymous",
    muted,
    loop: true,
    start: false,
    preload: "auto",
  });

  useEffect(() => {
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;
    return () => {
      const videoEl = (videoTexture as any)?.image as HTMLVideoElement | undefined;
      if (videoEl) videoEl.pause();
      videoTexture.dispose();
    };
  }, [videoTexture]);

  const syncPlayback = useCallback(() => {
    const videoEl = (videoTexture as any)?.image as HTMLVideoElement | undefined;
    if (!videoEl) return Promise.resolve();
    videoEl.muted = muted;
    videoEl.volume = muted ? 0 : volume;
    videoEl.loop = true;
    videoEl.playsInline = true;
    videoEl.preload = "auto";

    if (!shouldPlay) {
      videoEl.pause();
      return Promise.resolve();
    }

    return videoEl.play();
  }, [muted, shouldPlay, videoTexture, volume]);

  useEffect(() => {
    let cancelled = false;
    syncPlayback().catch(() => {
      if (cancelled) return;
      // User interaction required; playback will be started via explicit button.
    });
    return () => {
      cancelled = true;
      const videoEl = (videoTexture as any)?.image as HTMLVideoElement | undefined;
      if (videoEl) videoEl.pause();
    };
  }, [syncPlayback, videoTexture]);

  const requestPlay = useCallback(() => {
    const videoEl = (videoTexture as any)?.image as HTMLVideoElement | undefined;
    if (!videoEl) return Promise.resolve();
    videoEl.muted = muted;
    videoEl.volume = muted ? 0 : volume;
    videoEl.loop = true;
    videoEl.playsInline = true;
    videoEl.preload = "auto";
    return videoEl.play();
  }, [muted, videoTexture, volume]);

  return { videoTexture, requestPlay };
}

const ScreenPanel = ({
  w,
  h,
  t,
  videoTexture,
  detail = "high",
}: {
  w: number;
  h: number;
  t: number;
  videoTexture: THREE.VideoTexture;
  detail?: DetailLevel;
}) => {
  const planeSize =
    detail === "high"
      ? { w: w * 0.93, h: h * 0.85 }
      : { w: w * 0.9, h: h * 0.8 };
  const screenSurface = (
    <mesh position={[0, 0, t / 2 + 0.002]}>
      <planeGeometry args={[planeSize.w, planeSize.h]} />
      <meshBasicMaterial map={videoTexture} toneMapped={false} side={THREE.DoubleSide} color="#ffffff" />
    </mesh>
  );

  if (detail === "low") {
    return (
      <group>
        <mesh castShadow>
          <boxGeometry args={[w, h, t]} />
          <meshStandardMaterial color="#0f172a" roughness={0.6} metalness={0.1} />
        </mesh>
        {screenSurface}
      </group>
    );
  }

  if (detail === "medium") {
    return (
      <group>
        <mesh castShadow>
          <boxGeometry args={[w, h, t]} />
          <meshStandardMaterial color="#0b1220" roughness={0.4} metalness={0.2} />
        </mesh>
        {screenSurface}
      </group>
    );
  }

  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[w, h, t]} />
        <meshStandardMaterial color="#020617" roughness={0.2} metalness={0.7} />
      </mesh>
      {screenSurface}
    </group>
  );
};

const FloorBase = ({
  w,
  h,
  heightFromFloor,
  detail = "high",
}: {
  w: number;
  h: number;
  heightFromFloor: number;
  detail?: DetailLevel;
}) => {
  const baseThickness = 0.04;
  const baseRadius = Math.max(0.28, Math.min(0.38, w * 0.25 + 0.05));
  const poleHeight = Math.max(heightFromFloor - h / 2 - baseThickness, 0.4);
  const baseY = -heightFromFloor + baseThickness / 2;
  const poleY = -heightFromFloor + baseThickness + poleHeight / 2;

  return (
    <group>
      <mesh position={[0, baseY, 0]} receiveShadow>
        <cylinderGeometry args={[baseRadius, baseRadius * 0.75, baseThickness, detail === "low" ? 10 : 18]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, poleY, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, poleHeight, detail === "low" ? 8 : 14]} />
        <meshStandardMaterial color="#111827" roughness={0.45} metalness={0.35} />
      </mesh>
    </group>
  );
};

const ScreenLod = ({
  w,
  h,
  t,
  mount,
  heightFromFloor,
  videoSrc,
}: {
  w: number;
  h: number;
  t: number;
  mount: "wall" | "floor" | "truss";
  heightFromFloor: number;
  videoSrc?: string;
}) => {
  const lodRef = useRef<THREE.LOD | null>(null);
  const [videoActive, setVideoActive] = useState(false);
  const [userStarted, setUserStarted] = useState(false);
  const [playError, setPlayError] = useState(false);
  const lastActiveRef = useRef<boolean>(false);
  const volume = DEFAULT_VOLUME;
  const shouldPlay = userStarted && videoActive;
  const { videoTexture, requestPlay } = useScreenVideoTexture(videoSrc, shouldPlay, false, volume);

  const handlePlayRequest = useCallback(() => {
    setPlayError(false);
    requestPlay()
      .then(() => {
        setUserStarted(true);
      })
      .catch(() => setPlayError(true));
  }, [requestPlay]);

  useFrame(() => {
    const lod = lodRef.current;
    if (!lod) return;
    const currentLevel = lod.getCurrentLevel();
    const shouldPlayAtLod = currentLevel <= VIDEO_MAX_LOD_LEVEL;
    if (lastActiveRef.current !== shouldPlayAtLod) {
      lastActiveRef.current = shouldPlayAtLod;
      setVideoActive(shouldPlayAtLod);
    }
  });

  const playOverlay = !userStarted ? (
    <Html center position={[0, 0, t / 2 + 0.04]}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        <button type="button" className="btn-secondary" onClick={handlePlayRequest}>
          Video abspielen
        </button>
        {playError && (
          <span style={{ color: "#dc2626", fontSize: 12 }}>Interaktion erforderlich – Bitte erneut versuchen.</span>
        )}
      </div>
    </Html>
  ) : null;

  return (
    <Detailed ref={lodRef} distances={[...DEFAULT_LOD_DISTANCES]}>
      <group>
        {mount === "floor" && <FloorBase w={w} h={h} heightFromFloor={heightFromFloor} detail="high" />}
        <ScreenPanel w={w} h={h} t={t} videoTexture={videoTexture} detail="high" />
        {playOverlay}
      </group>
      <group>
        {mount === "floor" && <FloorBase w={w} h={h} heightFromFloor={heightFromFloor} detail="medium" />}
        <ScreenPanel w={w} h={h} t={t} videoTexture={videoTexture} detail="medium" />
        {playOverlay}
      </group>
      <group>
        {mount === "floor" && <FloorBase w={w} h={h} heightFromFloor={heightFromFloor} detail="low" />}
        <ScreenPanel w={w} h={h} t={t} videoTexture={videoTexture} detail="low" />
        {playOverlay}
      </group>
    </Detailed>
  );
};

export function Screen3D({
  id,
  dims,
  mount,
  position,
  rotationY = 0,
  heightFromFloor,
  videoSrc,
  selected,
  colliding,
  impacting,
  collisionClearance = 0,
  collider = "aabb",
  controls,
  onChange,
  onTransform,
  onDragStart,
  onDragEnd,
  onCollisionChange,
  onPointerDown,
  onClick,
  onContextMenu,
  onDoubleClick,
  onBoundsChange,
}: Screen3DProps) {
  const { w, h, t } = dims;
  const bodyRef = useRef<RapierRigidBody | null>(null);
  return (
    <TransformableObject
      position={position}
      rotation={[0, rotationY, 0]}
      collider={collider}
      enabled={controls.enabled}
      mode={controls.mode}
      snap={controls.snap}
      gridSize={controls.gridSize}
      showX={controls.showX}
      showY={controls.showY}
      showZ={controls.showZ}
      onChange={onChange}
      onTransform={onTransform}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onBoundsChange={onBoundsChange}
      physics={{
        enabled: true,
        bodyRef,
        type: "kinematicPosition",
        colliders: collider === "mesh" ? "hull" : "cuboid",
        friction: 0.8,
        restitution: 0.06,
        linearDamping: 4,
        angularDamping: 5,
        gravityScale: 0,
        enabledTranslations: [true, false, true],
        enabledRotations: [false, true, false],
        userData: { id, kind: "screen" },
        onCollisionChange,
      }}
    >
      <group
        userData={{ id, kind: "screen" }}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
      >
        <ScreenLod w={w} h={h} t={t} mount={mount} heightFromFloor={heightFromFloor} videoSrc={videoSrc} />
        {impacting && (
          <mesh position={[0, h + 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[w * 0.25, w * 0.4, 16]} />
            <meshBasicMaterial color="#f97316" transparent opacity={0.45} />
          </mesh>
        )}
        {selected && (
          <mesh>
            <boxGeometry args={[w, h, t]} />
            <meshBasicMaterial
              wireframe
              color={SELECTION_OUTLINE_COLOR}
              transparent
              opacity={0.92}
              depthWrite={false}
              depthTest={false}
              toneMapped={false}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        )}
        {colliding && (
          <Html center position={[0, h + 0.05, 0]}>
            <div
              style={{
                background: "#991b1b",
                color: "white",
                padding: "4px 8px",
                borderRadius: 8,
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
              }}
            >
              Screen kollidiert
            </div>
          </Html>
        )}
        {colliding && (
          <mesh>
            <boxGeometry args={[w + collisionClearance * 2, h + 0.05, t + collisionClearance * 2]} />
            <meshBasicMaterial wireframe color="#ef4444" />
          </mesh>
        )}
      </group>
    </TransformableObject>
  );
}
