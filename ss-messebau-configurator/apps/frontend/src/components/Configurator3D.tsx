// src/components/Configurator3D.tsx
/* eslint-disable react-hooks/refs */
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
  type JSX,
} from "react";
import { Canvas, extend, invalidate, useFrame, useThree, type ThreeElement, type ThreeEvent } from "@react-three/fiber";
import {
  CameraControls as DreiCameraControls,
  ContactShadows,
  Detailed,
  Environment,
  Grid,
  Html,
  PerformanceMonitor,
  TransformControls,
  useGLTF,
  useTexture,
  useVideoTexture,
} from "@react-three/drei";
import { Bloom, DepthOfField, EffectComposer as EffectComposerImpl } from "@react-three/postprocessing";

// EffectComposer declares children as JSX.Element (too restrictive).
// Wrapper accepts ReactNode so conditional rendering works without casts.
const EffectComposer = (props: Omit<React.ComponentProps<typeof EffectComposerImpl>, "children"> & { children: React.ReactNode }) =>
  <EffectComposerImpl {...props as React.ComponentProps<typeof EffectComposerImpl>} />;
import {
  Physics,
  RigidBody,
  CuboidCollider,
  type RapierRigidBody,
  type RigidBodyAutoCollider,
  type CollisionEnterPayload,
  type CollisionExitPayload,
  type RigidBodyTypeString,
} from "@react-three/rapier";
import CameraControls from "camera-controls";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import * as THREE from "three";

CameraControls.install({ THREE });
extend({ CameraControls });

type CameraControlsImpl = InstanceType<typeof CameraControls>;

// three-stdlib declares .object as private, but R3F exposes it at runtime
const getTransformTarget = (ref: React.RefObject<TransformControlsImpl | null>): THREE.Object3D | undefined =>
  (ref.current as Record<string, unknown> | null)?.["object"] as THREE.Object3D | undefined;

declare module "@react-three/fiber" {
  interface ThreeElements {
    cameraControls: ThreeElement<typeof CameraControls>;
  }
}

import { DEFAULT_LIGHTING, useConfigStore } from "../store/configStore";
import {
  buildSceneAabbs,
  findCollisionForMany,
  makeObb,
  cornerCounterColliders,
  type ColliderSpec,
  resolveClearance,
  type CollisionKind,
} from "../lib/collision";
import type { Obb } from "../lib/collision";
import { intersectObb } from "../lib/collision";
import { normalizeCounterPlacement } from "../lib/counters";
import { resolveCounterSize, resolveSeatingGeometry } from "../config/objectDimensions";
import { useCameraStore, type CameraPose } from "../store/cameraStore";
import { useTranslation } from "../i18n";
import { buildContextMenu } from "../contextMenu";
import { useContextMenuStore } from "../contextMenu/store";
import { useSceneInteractionStore } from "../store/sceneInteractionStore";
import { registerSceneCommandAdapter } from "../store/commandRegistry";
import type { ChairConfig, CounterConfig, ScreenConfig, LampConfig, WallSide } from "../lib/pricing";
import { applyTextureFit, clampTextureFit } from "../lib/textureMapping";
import Traverse from "./Traverse";
import Cabin from "./Cabin";
import { BoundingBoxOverlay } from "./BoundingBoxOverlay";
// WallSide importiert via pricing.ts (re-export aus @ss/shared)
type CounterVariant = "basic" | "premium" | "corner";
type CabinDoorSide = "front" | "left" | "right" | "back";
type LightingToneMapping = "aces" | "agx" | "reinhard" | "neutral";
type HdriPreset = "hall" | "studio" | "outdoor";
type LightingSettings = {
  hdri: HdriPreset;
  background: boolean;
  ambientColor: string;
  ambientIntensity: number;
  environmentIntensity: number;
  materialRoughness: number;
  materialMetalness: number;
  emissiveIntensity: number;
  exposure: number;
  toneMapping: LightingToneMapping;
  bloom: boolean;
  bloomIntensity: number;
  dof: boolean;
  dofFocus: number;
  dofBokehScale: number;
  envMapIntensity: number;
};
const HDRI_PRESETS: Record<
  HdriPreset,
  { preset: "warehouse" | "studio" | "sunset"; blur?: number }
> = {
  hall: { preset: "warehouse", blur: 0.25 },
  studio: { preset: "studio", blur: 0.18 },
  outdoor: { preset: "sunset", blur: 0.12 },
};
const DEFAULT_BACKGROUND_COLOR = "#020617";
const LazyTrussBanners = lazy(() => import("./TrussBanners"));
const clampDprValue = (value: number) => Math.min(1.5, Math.max(0.5, value));
const MIN_PITCH_RAD = THREE.MathUtils.degToRad(15);
const MAX_PITCH_RAD = THREE.MathUtils.degToRad(75);
const DEFAULT_MOUSE_BUTTONS = {
  left: CameraControls.ACTION.ROTATE,
  middle: CameraControls.ACTION.TRUCK,
  right: CameraControls.ACTION.NONE,
  wheel: CameraControls.ACTION.DOLLY,
};
/** Detaillierte, frei platzierbare Objekte (optionale Felder im Store) */
type DetailedCounter = CounterConfig;
type DetailedScreen = ScreenConfig;

type DebugEventLevel = "info" | "warn" | "error";
type DebugEvent = {
  id: number;
  title: string;
  details?: string;
  meta?: Record<string, unknown>;
  level?: DebugEventLevel;
  timestamp: number;
};
type DebugEventInput = Omit<DebugEvent, "id" | "timestamp">;

type RendererStats = {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  programs: number;
};

const normalizeEventKey = (event: KeyboardEvent | { key?: unknown }) =>
  typeof event?.key === "string" ? event.key.toLowerCase() : "";

function useAutoDispose(ref: MutableRefObject<THREE.Object3D | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    return () => {
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.geometry && typeof mesh.geometry.dispose === "function") {
          mesh.geometry.dispose();
        }
        const material = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) {
          material.forEach((m) => m?.dispose?.());
        } else {
          material?.dispose?.();
        }
      });
    };
  }, [ref]);
}

function WallAttachmentBox({
  position,
  rotationY = 0,
  height,
  floating,
  materialize,
  envMapIntensity = 1,
}: {
  position: [number, number, number];
  rotationY?: number;
  height: number;
  floating?: boolean;
  materialize?: (base: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterialParameters;
  envMapIntensity?: number;
}) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  useAutoDispose(meshRef as MutableRefObject<THREE.Object3D | null>);
  const materializeProps =
    materialize ?? ((base: THREE.MeshStandardMaterialParameters) => base);

  return (
    <mesh ref={meshRef} position={position} rotation-y={rotationY}>
      <boxGeometry args={[1.2, height, 0.03]} />
      <meshStandardMaterial
        {...materializeProps({
          emissive: "#38bdf8",
          emissiveIntensity: floating ? 1.2 : 2.2,
          color: "#0f172a",
          roughness: 0.4,
          transparent: floating,
          opacity: floating ? 0.45 : 1,
          envMapIntensity,
        })}
      />
    </mesh>
  );
}
/** Edit-Modus Toggle (Taste 'E'), Zustand im SceneInteractionStore */
function useEditModeHotkey(): boolean {
  const mode = useSceneInteractionStore((s) => s.mode);
  const setMode = useSceneInteractionStore((s) => s.setMode);
  const edit = mode === "edit";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = normalizeEventKey(e);
      if (k !== "e") return;
      setMode(edit ? "view" : "edit");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit, setMode]);

  return edit;
}
/** TransformÔÇæModus & Snap Shortcuts (T/R/S/G/Esc) */
function useTransformKeyboard(
  setSelectedKey: (v: string | null) => void
): { mode: "translate" | "rotate" | "scale"; snap: boolean } {
  const [mode, setMode] = useState<"translate" | "rotate" | "scale">("translate");
  const [snap, setSnap] = useState<boolean>(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = normalizeEventKey(e);
      if (!k) return;
      if (k === "t") setMode("translate");
      if (k === "r") setMode("rotate");
      if (k === "s") setMode("scale");
      if (k === "g") setSnap((v) => !v);
      if (k === "escape") setSelectedKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelectedKey]);
  return { mode, snap };
}
/** clamp X/Z in Standfl+ñche, optional mit halben Abmessungen eines Objekts */
function clampXZ(
  x: number,
  z: number,
  width: number,
  depth: number,
  halfW = 0,
  halfD = 0
) {
  const minX = -width / 2 + halfW;
  const maxX = width / 2 - halfW;
  const minZ = -depth / 2 + halfD;
  const maxZ = depth / 2 - halfD;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    z: Math.min(maxZ, Math.max(minZ, z)),
  };
}

const selectionTypeFromKey = (key: string | null | undefined): string | undefined => {
  if (!key) return undefined;
  if (key.startsWith("scr-")) return "screen";
  if (key.startsWith("ctr-")) return "counter";
  if (key.startsWith("seat-")) return "chair";
  if (key.startsWith("custom-")) return "custom";
  if (key.startsWith("lamp-")) return "lamp";
  if (key === "cabin") return "cabin";
  if (key === "truss") return "truss";
  return "object";
};
const snapValue = (value: number, step: number) => Math.round(value / step) * step;
const halfExtentsFromBox = (box: { centerX: number; centerZ: number; minX: number; maxX: number; minZ: number; maxZ: number }) => ({
  halfW: Math.max(Math.abs(box.maxX - box.centerX), Math.abs(box.centerX - box.minX)),
  halfD: Math.max(Math.abs(box.maxZ - box.centerZ), Math.abs(box.centerZ - box.minZ)),
});
/** Geometrien */
function CounterBlock({
  variant,
  w = 0.9,
  d = 0.5,
  h = 1.1,
  materialize,
  envMapIntensity = 1.2,
}: {
  variant: CounterVariant;
  w?: number;
  d?: number;
  h?: number;
  materialize?: (base: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterialParameters;
  envMapIntensity?: number;
}) {
  const lodScale = useCameraStore((s) => s.lodScale);
  const materializeProps =
    materialize ?? ((base: THREE.MeshStandardMaterialParameters) => base);
  const detailed = (() => {
    if (variant === "basic") {
      return (
        <mesh castShadow receiveShadow frustumCulled>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            {...materializeProps({
              color: "#1d4ed8",
              roughness: 0.35,
              metalness: 0.45,
              envMapIntensity,
            })}
          />
        </mesh>
      );
    }
    if (variant === "premium") {
      return (
        <group>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow frustumCulled>
            <boxGeometry args={[Math.max(w, 1.4), h, Math.max(d, 0.6)]} />
            <meshStandardMaterial
              {...materializeProps({
                color: "#0f172a",
                roughness: 0.4,
                metalness: 0.6,
                envMapIntensity,
              })}
            />
          </mesh>
          <mesh position={[0, h * 0.55, Math.max(d, 0.6) / 2 - 0.29]} castShadow={false} frustumCulled>
            <boxGeometry args={[1.2, 0.5, 0.02]} />
            <meshStandardMaterial
              {...materializeProps({
                color: "#1d4ed8",
                roughness: 0.2,
                metalness: 0.7,
                envMapIntensity,
              })}
            />
          </mesh>
          <mesh position={[0, h + 0.02, 0]} frustumCulled>
            <boxGeometry args={[Math.max(w, 1.45), 0.06, Math.max(d, 0.65)]} />
            <meshStandardMaterial
              {...materializeProps({
                color: "#e5e7eb",
                roughness: 0.2,
                metalness: 0.3,
                envMapIntensity,
              })}
            />
          </mesh>
        </group>
      );
    }
    // corner
    return (
      <group>
        <mesh position={[-w / 2 + w * 0.5, h / 2, 0]} castShadow receiveShadow frustumCulled>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            {...materializeProps({
              color: "#1e293b",
              roughness: 0.5,
              metalness: 0.35,
              envMapIntensity,
            })}
          />
        </mesh>
        <mesh position={[0, h / 2, -d / 2 + d * 0.5]} castShadow receiveShadow frustumCulled>
          <boxGeometry args={[d, h, w]} />
          <meshStandardMaterial
            {...materializeProps({
              color: "#1e293b",
              roughness: 0.5,
              metalness: 0.35,
              envMapIntensity,
            })}
          />
        </mesh>
        <mesh position={[-0.2, h + 0.02, -0.2]} frustumCulled>
          <boxGeometry args={[1.2, 0.06, 1.2]} />
          <meshStandardMaterial
            {...materializeProps({
              color: "#e5e7eb",
              roughness: 0.3,
              metalness: 0.3,
              envMapIntensity,
            })}
          />
        </mesh>
      </group>
    );
  })();
  const medium = (
    <mesh castShadow receiveShadow frustumCulled>
      <boxGeometry args={[Math.max(w, 1.2), h * 0.95, Math.max(d, 0.55)]} />
      <meshStandardMaterial
        color="#1e293b"
        roughness={0.55}
        metalness={0.25}
        envMapIntensity={envMapIntensity}
      />
    </mesh>
  );
  const low = (
    <mesh frustumCulled>
      <boxGeometry args={[Math.max(w, 1), h * 0.9, Math.max(d, 0.5)]} />
      <meshBasicMaterial color="#475569" />
    </mesh>
  );
  return (
    <Detailed distances={[5, 12, 18].map((d) => d * lodScale)}>
      {detailed}
      {medium}
      {low}
    </Detailed>
  );
}
function ScreenPanel({
  w = 0.9,
  h = 0.55,
  t = 0.02,
  materialize,
  videoSrc,
  videoMuted = true,
  videoPaused = false,
  videoVolume = 0,
}: {
  w?: number;
  h?: number;
  t?: number;
  materialize?: (base: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterialParameters;
  videoSrc?: string;
  videoMuted?: boolean;
  videoPaused?: boolean;
  videoVolume?: number;
}) {
  const lodScale = useCameraStore((s) => s.lodScale);
  const clampedVolume = Math.min(1, Math.max(0, videoVolume ?? 0));
  const materializeProps =
    materialize ?? ((base: THREE.MeshStandardMaterialParameters) => base);
  const videoTexture = useVideoTexture(videoSrc ?? "", {
    muted: videoMuted ?? true,
    loop: true,
    start: false,
    autoplay: false,
    crossOrigin: "anonymous",
    playsInline: true,
  }) as unknown as THREE.VideoTexture | null;

  useEffect(() => {
    if (!videoTexture || !videoSrc) return;
    const videoEl = videoTexture.image as HTMLVideoElement | undefined;
    if (!videoEl) return;
    videoEl.loop = true;
    videoEl.muted = videoMuted ?? true;
    videoEl.playsInline = true;
    videoEl.crossOrigin = "anonymous";
    videoEl.volume = clampedVolume;
    if (videoPaused) {
      videoEl.pause();
    } else {
      void videoEl.play().catch(() => undefined);
    }
  }, [clampedVolume, videoMuted, videoPaused, videoSrc, videoTexture]);

  const hasVideo = Boolean(videoSrc);
  return (
    <Detailed distances={[6, 12].map((d) => d * lodScale)}>
      <mesh castShadow frustumCulled>
        <boxGeometry args={[w, h, t]} />
        <meshStandardMaterial
          {...materializeProps({ color: "#020617", roughness: 0.2, metalness: 0.7 })}
        />
      </mesh>
      <mesh castShadow frustumCulled>
        <boxGeometry args={[w, h, t]} />
        <meshStandardMaterial
          {...materializeProps({ color: "#0f172a", roughness: 0.35, metalness: 0.4 })}
        />
      </mesh>
      {hasVideo && videoTexture ? (
        <mesh position={[0, 0, t / 2 + 0.0005]} frustumCulled>
          <planeGeometry args={[w * 0.92, h * 0.9]} />
          <meshBasicMaterial map={videoTexture} toneMapped={false} transparent opacity={0.98} />
        </mesh>
      ) : (
        <group />
      )}
    </Detailed>
  );
}
const SEATING_COLORS: Record<"chair" | "barstool" | "lounge", { seat: string; frame: string }> = {
  chair: { seat: "#e5e7eb", frame: "#0f172a" },
  barstool: { seat: "#f5f3ff", frame: "#111827" },
  lounge: { seat: "#e2e8f0", frame: "#0f172a" },
};
function SeatMesh({
  seat,
  materialize,
}: {
  seat: ChairConfig;
  materialize?: (base: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterialParameters;
}) {
  const lodScale = useCameraStore((s) => s.lodScale);
  const materializeProps =
    materialize ?? ((base: THREE.MeshStandardMaterialParameters) => base);
  const type = (seat.type ?? "chair") as keyof typeof SEATING_COLORS;
  const dims = resolveSeatingGeometry(type, seat.footprint, seat.seatHeight, seat.backHeight);
  const palette = SEATING_COLORS[type] ?? SEATING_COLORS.chair;
  const cover = seat.cover ?? "none";
  const seatColor = (
    cover === "white"
      ? "#f8fafc"
      : cover === "branding"
      ? "#e0f2fe"
      : seat.color ?? palette.seat
  );
  const frameColor = seat.frameColor ?? palette.frame;
  const seatThickness = Math.max(0.05, Math.min(0.12, dims.seatHeight * 0.25));
  const legHeight = Math.max(0.3, dims.seatHeight - seatThickness / 2);
  const backHeight = Math.max(0.12, dims.backHeight - dims.seatHeight);
  const legOffsetX = Math.max(0.05, dims.w / 2 - 0.08);
  const legOffsetZ = Math.max(0.05, dims.d / 2 - 0.08);
  const backThickness = Math.max(0.05, dims.d * 0.12);
  return (
    <Detailed distances={[6, 12, 20].map((d) => d * lodScale)}>
      <group>
        {[[-legOffsetX, -legOffsetZ], [legOffsetX, -legOffsetZ], [-legOffsetX, legOffsetZ], [legOffsetX, legOffsetZ]].map(
          ([lx, lz], idx) => (
            <mesh key={idx} position={[lx, legHeight / 2, lz]} castShadow frustumCulled>
              <cylinderGeometry args={[0.02, 0.022, legHeight, 10]} />
              <meshStandardMaterial
                {...materializeProps({ color: frameColor, roughness: 0.35, metalness: 0.55 })}
              />
            </mesh>
          )
        )}
        <mesh position={[0, legHeight, 0]} castShadow frustumCulled>
          <boxGeometry args={[dims.w, seatThickness, dims.d]} />
          <meshStandardMaterial
            {...materializeProps({ color: seatColor, roughness: 0.45, metalness: 0.2 })}
          />
        </mesh>
        <mesh position={[0, legHeight + backHeight / 2, -dims.d / 2 + backThickness / 2]} castShadow frustumCulled>
          <boxGeometry args={[dims.w * 0.92, backHeight, backThickness]} />
          <meshStandardMaterial
            {...materializeProps({ color: seatColor, roughness: 0.5, metalness: 0.15 })}
          />
        </mesh>
        <mesh position={[0, legHeight + seatThickness * 0.35, 0]} castShadow frustumCulled>
          <boxGeometry args={[dims.w * 0.94, seatThickness * 0.5, dims.d * 0.92]} />
          <meshStandardMaterial
            {...materializeProps({ color: frameColor, roughness: 0.4, metalness: 0.4 })}
          />
        </mesh>
      </group>
      <mesh position={[0, legHeight, 0]} castShadow frustumCulled>
        <boxGeometry args={[dims.w, seatThickness * 0.85, dims.d]} />
        <meshStandardMaterial
          {...materializeProps({ color: seatColor, roughness: 0.6, metalness: 0.1 })}
        />
      </mesh>
      <mesh position={[0, legHeight * 0.9, 0]} castShadow frustumCulled>
        <boxGeometry args={[dims.w * 0.95, seatThickness * 0.6, dims.d * 0.95]} />
        <meshBasicMaterial color={seatColor} />
      </mesh>
    </Detailed>
  );
}

type TransformablePhysics = {
  enabled: boolean;
  type?: RigidBodyTypeString;
  colliders?: RigidBodyAutoCollider | false;
  mass?: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  enabledTranslations?: [boolean, boolean, boolean];
  enabledRotations?: [boolean, boolean, boolean];
  childrenColliders?: ReactNode;
  userData?: Record<string, unknown>;
  impactRadius?: number;
  onCollisionChange?: (colliding: boolean) => void;
};
/** TransformControls Wrapper: sperrt Orbit w+ñhrend Interaktion */
function Transformable({
  enabled,
  mode,
  snap,
  snapStep = 0.1,
  children,
  physics,
  onChange,
  onDragStart,
  onDragEnd,
}: {
  enabled: boolean;
  mode: "translate" | "rotate" | "scale";
  snap: boolean;
  snapStep?: number;
  children: ReactNode;
  physics?: TransformablePhysics;
  onChange?: (pos: THREE.Vector3) => THREE.Vector3 | void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const tcRef = useRef<TransformControlsImpl | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const rigidRef = useRef<RapierRigidBody | null>(null);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const collisionCountRef = useRef(0);
  const invalidateFrame = useThree((state) => state.invalidate);
  useAutoDispose(groupRef as MutableRefObject<THREE.Object3D | null>);
  const [collisionFlash, setCollisionFlash] = useState<boolean>(false);
  const collisionTimerRef = useRef<number | null>(null);
  const shouldHandleCollision = useCallback(
    (payload?: CollisionEnterPayload | CollisionExitPayload) => {
      const otherKind = payload?.other?.rigidBodyObject?.userData?.kind;
      return otherKind !== "floor" && otherKind !== "wall";
    },
    []
  );
  const syncRigidBodyFromObject = useCallback(
    (target?: THREE.Object3D | null) => {
      if (!physics?.enabled) return;
      const body = rigidRef.current;
      const source =
        target ??
        getTransformTarget(tcRef) ??
        groupRef.current;
      if (!body || !source) return;
      source.updateWorldMatrix(true, false);
      source.getWorldPosition(tmpVec);
      source.getWorldQuaternion(tmpQuat);
      body.setTranslation({ x: tmpVec.x, y: tmpVec.y, z: tmpVec.z }, true);
      body.setRotation({ x: tmpQuat.x, y: tmpQuat.y, z: tmpQuat.z, w: tmpQuat.w }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },
    [physics?.enabled, tmpQuat, tmpVec]
  );
  useEffect(() => {
    return () => {
      if (collisionTimerRef.current) {
        window.clearTimeout(collisionTimerRef.current);
      }
    };
  }, []);
  const handleCollisionChange = useCallback(
    (state: boolean) => {
      if (!physics?.enabled) return;
      physics.onCollisionChange?.(state);
      if (state) {
        setCollisionFlash(true);
        if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
        collisionTimerRef.current = window.setTimeout(() => setCollisionFlash(false), 220);
      } else {
        setCollisionFlash(false);
      }
    },
    [physics]
  );
  const handleCollisionEnter = useCallback(
    (payload: CollisionEnterPayload) => {
      if (!shouldHandleCollision(payload)) return;
      collisionCountRef.current += 1;
      handleCollisionChange(true);
    },
    [handleCollisionChange, shouldHandleCollision]
  );
  const handleCollisionExit = useCallback(
    (payload: CollisionExitPayload) => {
      if (!shouldHandleCollision(payload)) return;
      collisionCountRef.current = Math.max(0, collisionCountRef.current - 1);
      if (collisionCountRef.current === 0) {
        handleCollisionChange(false);
      }
    },
    [handleCollisionChange, shouldHandleCollision]
  );
  useEffect(() => {
    syncRigidBodyFromObject();
  }, [syncRigidBodyFromObject]);
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;
    const controls = tc as unknown as {
      addEventListener: (type: string, handler: (event: unknown) => void) => void;
      removeEventListener: (type: string, handler: (event: unknown) => void) => void;
    };
    const handleChange = () => {
      const target = getTransformTarget(tcRef) ?? groupRef.current;
      if (!target) return;
      const override = onChange?.(target.position);
      if (override) {
        target.position.copy(override);
        target.updateMatrixWorld();
      }
      syncRigidBodyFromObject(target);
      invalidateFrame();
    };
    const handleMouseDown = () => {
      onDragStart?.();
      invalidateFrame();
    };
    const handleMouseUp = () => {
      onDragEnd?.();
      invalidateFrame();
    };
    const handleDraggingChanged = (event: unknown) => {
      const value = (event as { value?: boolean })?.value;
      if (value === true) {
        onDragStart?.();
      } else if (value === false) {
        onDragEnd?.();
      }
      invalidateFrame();
    };
    controls.addEventListener("objectChange", handleChange);
    controls.addEventListener("mouseDown", handleMouseDown);
    controls.addEventListener("mouseUp", handleMouseUp);
    controls.addEventListener("dragging-changed", handleDraggingChanged);
    return () => {
      controls.removeEventListener("objectChange", handleChange);
      controls.removeEventListener("mouseDown", handleMouseDown);
      controls.removeEventListener("mouseUp", handleMouseUp);
      controls.removeEventListener("dragging-changed", handleDraggingChanged);
    };
  }, [invalidateFrame, onChange, onDragEnd, onDragStart, syncRigidBodyFromObject]);
  useEffect(() => {
    const ctrl = tcRef.current;
    if (!ctrl || typeof (ctrl as unknown as { dispose?: () => void }).dispose !== "function") return;
    return () => {
      (ctrl as unknown as { dispose?: () => void }).dispose?.();
    };
  }, []);
  const content = (
    <group ref={groupRef}>
      {children}
      {physics?.childrenColliders}
      {physics?.enabled && collisionFlash && (
        <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry
            args={[
              Math.max(0.12, (physics.impactRadius ?? 0.35) * 0.55),
              Math.max(0.2, physics.impactRadius ?? 0.35),
              20,
            ]}
          />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
  const wrapped = physics?.enabled ? (
    <RigidBody
      ref={rigidRef}
      type={physics.type ?? "dynamic"}
      colliders={physics.colliders ?? "hull"}
      mass={physics.mass}
      restitution={physics.restitution ?? 0.14}
      friction={physics.friction ?? 0.9}
      linearDamping={physics.linearDamping ?? 3.5}
      angularDamping={physics.angularDamping ?? 6}
      gravityScale={physics.gravityScale ?? 1}
      position={physics.position}
      rotation={physics.rotation}
      enabledTranslations={physics.enabledTranslations ?? ([true, true, true] as [boolean, boolean, boolean])}
      enabledRotations={physics.enabledRotations ?? ([false, true, false] as [boolean, boolean, boolean])}
      userData={physics.userData}
      onCollisionEnter={handleCollisionEnter}
      onCollisionExit={handleCollisionExit}
    >
      {content}
    </RigidBody>
  ) : (
    content
  );
  if (!enabled) {
    return wrapped;
  }
  return (
    <TransformControls
      ref={tcRef}
      mode={mode}
      showX
      showZ
      showY={false}
      translationSnap={snap ? snapStep : 0}
      rotationSnap={snap ? THREE.MathUtils.degToRad(15) : 0}
      scaleSnap={snap ? snapStep : 0}
    >
      {wrapped}
    </TransformControls>
  );
}

type CustomModelProps = {
  url: string;
  scale?: number;
  onBounds?: (box: THREE.Box3) => void;
};

function CustomModel({ url, scale = 1, onBounds }: CustomModelProps) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh?.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    clone.scale.setScalar(scale || 1);
    clone.updateMatrixWorld(true);
    return clone;
  }, [gltf.scene, scale]);

  useEffect(() => {
    if (!onBounds) return;
    const box = new THREE.Box3().setFromObject(scene);
    onBounds(box);
  }, [onBounds, scene]);

  return <primitive object={scene} />;
}

function StandMesh({
  orbitRef,
  editMode,
  lighting: lightingOverride,
  onFrameAll,
  onDebugEvent,
}: {
  orbitRef: MutableRefObject<CameraControlsImpl | null>;
  editMode: boolean;
  lighting?: LightingSettings;
  onFrameAll?: () => void;
  onDebugEvent?: (event: DebugEventInput) => void;
}) {
  const { config, setConfig } = useConfigStore();
  const queueCameraAction = useCameraStore((s) => s.queueAction);
  const { width, depth, height, modules } = config;
  const lightingConfig: Partial<LightingSettings> = useMemo(
    () => lightingOverride ?? modules.lighting ?? {},
    [lightingOverride, modules.lighting]
  );
  const resolvedLighting = useMemo(
    () => ({ ...DEFAULT_LIGHTING, ...lightingConfig }),
    [lightingConfig]
  );
  const envMapIntensity = resolvedLighting.envMapIntensity ?? DEFAULT_LIGHTING.envMapIntensity;
  const lodScale = useCameraStore((s) => s.lodScale);
  // ---- Lokale Edit-/UI-State
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectionBoundsRef = useRef<Record<string, THREE.Box3>>({});
  selectionBoundsRef.current = {};
  const openContextMenu = useContextMenuStore((s) => s.openMenu);
  const closeContextMenu = useContextMenuStore((s) => s.closeMenu);
  const setInteractionSelection = useSceneInteractionStore((s) => s.setSelection);
  const clearInteractionSelection = useSceneInteractionStore((s) => s.clearSelection);
  const setInteractionCollision = useSceneInteractionStore((s) => s.setCollision);
  const setInteractionMousePosition = useSceneInteractionStore((s) => s.setMousePosition);
  const setInteractionSelectionCenter = useSceneInteractionStore((s) => s.setSelectionCenter);
  const getInteractionContext = useSceneInteractionStore((s) => s.getContext);
  const selectionIds = useSceneInteractionStore((s) => s.selectionIds);
  const frameBox = useCallback(
    async (box?: THREE.Box3 | null) => {
      const controls = orbitRef.current;
      if (!controls || !box) return;
      controls.stop();
      const padding = Math.max(Math.max(width, depth) * 0.06 + 0.5, 0.8);
      const expanded = box.clone().expandByScalar(padding);
      await controls.fitToBox(expanded, true);
    },
    [depth, orbitRef, width]
  );
  const frameSelection = useCallback(
    (key: string | null) => {
      if (!key) return false;
      const box = selectionBoundsRef.current[key];
      if (!box) return false;
      void frameBox(box);
      return true;
    },
    [frameBox]
  );
  const registerBounds = useCallback((key: string, box: THREE.Box3) => {
    selectionBoundsRef.current[key] = box;
    return box;
  }, []);
  const selectionCenterOf = useCallback((key: string | null | undefined): [number, number, number] | undefined => {
    if (!key) return undefined;
    const box = selectionBoundsRef.current[key];
    if (!box) return undefined;
    const center = box.getCenter(new THREE.Vector3());
    return [center.x, center.y, center.z];
  }, []);
  const lastSelectionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onDebugEvent) return;
    if (lastSelectionRef.current === selectedKey) return;
    if (selectedKey) {
      onDebugEvent({
        title: "Selection changed",
        details: selectedKey,
        meta: { center: selectionCenterOf(selectedKey) },
      });
    } else if (lastSelectionRef.current) {
      onDebugEvent({ title: "Selection cleared", details: lastSelectionRef.current });
    }
    lastSelectionRef.current = selectedKey;
  }, [onDebugEvent, selectedKey, selectionCenterOf]);
  // TransformÔÇæShortcuts (T/R/S/G/Esc)
  const { mode: transformMode, snap: snapOn } = useTransformKeyboard(setSelectedKey);
  // Orbit sperren / freigeben
  const setOrbitEnabled = useCallback(
    (enabled: boolean) => {
      if (orbitRef?.current) orbitRef.current.enabled = enabled;
    },
    [orbitRef]
  );
  const disableOrbit = useCallback(() => setOrbitEnabled(false), [setOrbitEnabled]);
  const enableOrbit = useCallback(() => setOrbitEnabled(true), [setOrbitEnabled]);
  // Basis-Module
  const {
    wallsClosedSides = 0,
    storageRoom = false,
    storageDoorSide,
    ledFrames,
    ledWall,
    counters = 0,
    countersWall,
    countersWithPower,
    screens = 0,
    screensWall,
    ledFramesDetailed = [],
    cabin,
    trussLightType = "spot",
    trussLightsFront = 0,
    trussLightsBack = 0,
    trussLightsLeft = 0,
    trussLightsRight = 0,
    wallLightsBack = 0,
    wallLightsLeft = 0,
    wallLightsRight = 0,
  } = modules;
  // Truss & Licht
  const trussEnabled: boolean = !!modules.truss;
  // Kollisionsabstand (konfigurierbar ++ber modules.collisionClearance)
  const globalCollisionClearance: number = Math.max(
    0,
    typeof modules.collisionClearance === "number" ? modules.collisionClearance : 0
  );
  const clearanceFor = useCallback(
    (kind: CollisionKind, custom?: number) => resolveClearance(kind, custom, globalCollisionClearance),
    [globalCollisionClearance]
  );
  const gridStep: number = Math.max(0.01, Math.min(1, modules.gridStep ?? modules.snapStep ?? 0.1));
  const snapStep: number = gridStep;
  const snapToStructure: boolean = modules.snapToStructure ?? true;
  // Banner / Truss
  const bannersFront: number = modules.trussBannersFront ?? 0;
  const bannersBack: number = modules.trussBannersBack ?? 0;
  const bannersLeft: number = modules.trussBannersLeft ?? 0;
  const bannersRight: number = modules.trussBannersRight ?? 0;
  const bannerWidth: number = modules.trussBannerWidth ?? 3;
  const bannerHeight: number = modules.trussBannerHeight ?? 1;
  const bannerThickness = 0.04;
  const hasTrussBanners = bannersFront + bannersBack + bannersLeft + bannersRight > 0;
  // Boden/Standh+Âhen
  const floorConfig = modules.floor;
  const isRaised = floorConfig?.raised ?? modules.raisedFloor ?? false;
  const floorHeight = isRaised ? 0.08 : 0.025;
  const wallHeight = height;
  const wallCenterY = floorHeight + wallHeight / 2;
  const defaultTrussHeight = floorHeight + wallHeight + 0.5;
  const rawTrussH = config.traverseHeight ?? modules.trussHeight;
  const trussHeight = Math.max(
    defaultTrussHeight,
    typeof rawTrussH === "number" ? rawTrussH : defaultTrussHeight
  );
  const trussOffsetX: number = (modules.trussOffset?.x ?? 0) as number;
  const trussOffsetZ: number = (modules.trussOffset?.z ?? 0) as number;
  const BLANK_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAosBv2jz2l0AAAAASUVORK5CYII=";
  const bannerMipmaps = Array.isArray(modules.trussBannerMipmaps)
    ? modules.trussBannerMipmaps.filter(Boolean)
    : [];
  const bannerWebpUrl =
    modules.trussBannerImageUrl ??
    (bannerMipmaps.length > 0 ? (bannerMipmaps[0] as string) : undefined) ??
    modules.trussBannerWebpUrl;
  const bannerKtx2Url = modules.trussBannerKtx2Url;
  const scaleX = width;
  const scaleZ = depth;

  // Geometrie-Hilfswerte
  const wallThickness = 0.06;
  const panelGap = 0.01;
  // Innenpositionen der Wand-Frontfl+ñchen
  const backWallFrontZ = -depth / 2 + wallThickness + panelGap;
  const leftWallInnerX = -width / 2 + wallThickness + panelGap;
  const rightWallInnerX = width / 2 - wallThickness - panelGap;
  const ledWallSide =
    ((ledFramesDetailed[0]?.wallSide ?? ledFramesDetailed[0]?.lastWallSide ?? ledWall) as WallSide) ??
    "back";
  const screensWallSide = (screensWall as WallSide) ?? "back";
  const countersPlacement = normalizeCounterPlacement(countersWall);
  const attachmentIndex = modules.wallAttachmentIndex;
  const allowedWallsList = useMemo(() => {
    const list: WallSide[] = [];
    if (wallsClosedSides >= 1) list.push("back");
    if (wallsClosedSides >= 2) list.push("left");
    if (wallsClosedSides >= 3) list.push("right");
    return list;
  }, [wallsClosedSides]);
  const allowedWallsSet = useMemo(() => new Set<WallSide>(allowedWallsList), [allowedWallsList]);
  const neutralWall = attachmentIndex?.neutralWall ?? allowedWallsList[0];
  const attachmentById = attachmentIndex?.byId ?? {};
  // Kabine aktiv?
  const cabinEnabled: boolean = Boolean(cabin?.enabled ?? storageRoom);
  // Kabinengeometrie + Position (Zentrum)
  const cabinWidth = cabin?.width ?? 1.5;
  const cabinDepth = cabin?.depth ?? 1.5;
  const cabinHeight = cabin?.height ?? wallHeight;
  const cabinPosX = cabin?.position?.x ?? -width / 2 + cabinWidth / 2 + 0.25;
  const cabinPosZ = cabin?.position?.z ?? -depth / 2 + cabinDepth / 2 + 0.25;
  const cabinCenterY = floorHeight + cabinHeight / 2;
  const requestedCabinDoor: CabinDoorSide =
    (cabin?.doorSide as CabinDoorSide | undefined) ??
    (storageDoorSide as CabinDoorSide | undefined) ??
    "front";
  const cabinMargins: Record<CabinDoorSide, number> = {
    front: depth / 2 - (cabinPosZ + cabinDepth / 2),
    back: cabinPosZ + depth / 2 - cabinDepth / 2,
    right: width / 2 - (cabinPosX + cabinWidth / 2),
    left: cabinPosX + width / 2 - cabinWidth / 2,
  };
  const interiorDoorSide: CabinDoorSide =
    (Object.entries(cabinMargins).sort((a, b) => b[1] - a[1])[0]?.[0] as CabinDoorSide) ?? "front";
  const minDoorMargin = 0.2;
  const doorSide: CabinDoorSide =
    (cabinMargins[requestedCabinDoor] ?? -Infinity) >= minDoorMargin ? requestedCabinDoor : interiorDoorSide;

  const emissiveScaled = useCallback(
    (value?: number) =>
      Math.max(
        0,
        (value ?? 1) *
          (resolvedLighting.emissiveIntensity ?? DEFAULT_LIGHTING.emissiveIntensity)
      ),
    [resolvedLighting]
  );

  const pbr = useCallback(
    (base: THREE.MeshStandardMaterialParameters) => {
      const baseRough = typeof base.roughness === "number" ? base.roughness : 0.6;
      const baseMetal = typeof base.metalness === "number" ? base.metalness : 0.2;
      const tuned: THREE.MeshStandardMaterialParameters = {
        ...base,
        roughness: THREE.MathUtils.clamp(
          baseRough * (resolvedLighting.materialRoughness ?? DEFAULT_LIGHTING.materialRoughness),
          0,
          1
        ),
        metalness: THREE.MathUtils.clamp(
          baseMetal *
            (resolvedLighting.materialMetalness ?? DEFAULT_LIGHTING.materialMetalness),
          0,
          1
        ),
        envMapIntensity:
          base.envMapIntensity ??
          resolvedLighting.envMapIntensity ??
          DEFAULT_LIGHTING.envMapIntensity,
      };
      if (base.emissiveIntensity !== undefined) {
        tuned.emissiveIntensity = emissiveScaled(base.emissiveIntensity);
      }
      return tuned;
    },
    [emissiveScaled, resolvedLighting]
  );
  // Boden-Material
  const floorType = floorConfig?.type ?? "carpet";
  const baseFloorMaterial = useMemo(() => {
    switch (floorType) {
      case "laminate":
        return { color: "#e5e7eb", roughness: 0.35, metalness: 0.08 } as const;
      case "vinyl":
        return { color: "#0f172a", roughness: 0.3, metalness: 0.15 } as const;
      case "wood":
        return { color: "#92400e", roughness: 0.6, metalness: 0.1 } as const;
      case "carpet":
        return { color: "#1e293b", roughness: 0.95, metalness: 0.05 } as const;
      default:
        return { color: "#1e293b", roughness: 0.95, metalness: 0.05 } as const;
    }
  }, [floorType]);
  const floorMaterial = useMemo(
    () => pbr(baseFloorMaterial as THREE.MeshStandardMaterialParameters),
    [baseFloorMaterial, pbr]
  );
  const floorTextureUrl = modules.floor?.textureUrl;
  const floorTextureFit = clampTextureFit(modules.floor?.textureFit);
  const floorTextureRepeat = useMemo<[number, number]>(() => {
    const rep = modules.floor?.textureRepeat;
    if (Array.isArray(rep) && rep.length >= 2) {
      return [Number(rep[0]) || 1, Number(rep[1]) || 1];
    }
    return [1, 1];
  }, [modules.floor?.textureRepeat]);
  const floorTexture = useTexture(floorTextureUrl ?? BLANK_PNG) as THREE.Texture;

  useEffect(() => {
    if (!floorTextureUrl) return;
    applyTextureFit(floorTexture, scaleX, scaleZ, floorTextureFit, floorTextureRepeat);
  }, [floorTexture, floorTextureFit, floorTextureRepeat, floorTextureUrl, scaleX, scaleZ]);
  /** Wand-Oberfl+ñchen (system | wood | banner | seg | led) */
  type Surface = "system" | "wood" | "banner" | "seg" | "led";
  const wallsDetail = (modules.wallsDetail ?? {}) as Record<
    WallSide,
    {
      surface?: Surface;
      height?: number;
      textureUrl?: string;
      textureFit?: ReturnType<typeof clampTextureFit>;
      textureRepeat?: [number, number];
    }
  >;
  const wallBackTextureUrl = wallsDetail.back?.textureUrl;
  const wallBackTextureFit = clampTextureFit(wallsDetail.back?.textureFit);
  const wallBackTextureRepeat = useMemo<[number, number]>(() => {
    const rep = wallsDetail.back?.textureRepeat;
    if (Array.isArray(rep) && rep.length >= 2) {
      return [Number(rep[0]) || 1, Number(rep[1]) || 1];
    }
    return [1, 1];
  }, [wallsDetail.back?.textureRepeat]);
  const wallBackTexture = useTexture(wallBackTextureUrl ?? BLANK_PNG) as THREE.Texture;

  const wallLeftTextureUrl = wallsDetail.left?.textureUrl;
  const wallLeftTextureFit = clampTextureFit(wallsDetail.left?.textureFit);
  const wallLeftTextureRepeat = useMemo<[number, number]>(() => {
    const rep = wallsDetail.left?.textureRepeat;
    if (Array.isArray(rep) && rep.length >= 2) {
      return [Number(rep[0]) || 1, Number(rep[1]) || 1];
    }
    return [1, 1];
  }, [wallsDetail.left?.textureRepeat]);
  const wallLeftTexture = useTexture(wallLeftTextureUrl ?? BLANK_PNG) as THREE.Texture;

  const wallRightTextureUrl = wallsDetail.right?.textureUrl;
  const wallRightTextureFit = clampTextureFit(wallsDetail.right?.textureFit);
  const wallRightTextureRepeat = useMemo<[number, number]>(() => {
    const rep = wallsDetail.right?.textureRepeat;
    if (Array.isArray(rep) && rep.length >= 2) {
      return [Number(rep[0]) || 1, Number(rep[1]) || 1];
    }
    return [1, 1];
  }, [wallsDetail.right?.textureRepeat]);
  const wallRightTexture = useTexture(wallRightTextureUrl ?? BLANK_PNG) as THREE.Texture;

  useEffect(() => {
    if (!wallBackTextureUrl) return;
    applyTextureFit(wallBackTexture, width, wallHeight, wallBackTextureFit, wallBackTextureRepeat);
  }, [wallBackTexture, wallBackTextureFit, wallBackTextureRepeat, wallBackTextureUrl, wallHeight, width]);

  useEffect(() => {
    if (!wallLeftTextureUrl) return;
    applyTextureFit(wallLeftTexture, depth, wallHeight, wallLeftTextureFit, wallLeftTextureRepeat);
  }, [depth, wallHeight, wallLeftTexture, wallLeftTextureFit, wallLeftTextureRepeat, wallLeftTextureUrl]);

  useEffect(() => {
    if (!wallRightTextureUrl) return;
    applyTextureFit(wallRightTexture, depth, wallHeight, wallRightTextureFit, wallRightTextureRepeat);
  }, [depth, wallHeight, wallRightTexture, wallRightTextureFit, wallRightTextureRepeat, wallRightTextureUrl]);
  const surfaceOf = (side: WallSide): Surface => (wallsDetail[side]?.surface ?? "system") as Surface;
  const wallMaterialProps = useCallback(
    (s: Surface): THREE.MeshStandardMaterialParameters => {
      let base: THREE.MeshStandardMaterialParameters;
      switch (s) {
        case "wood":
          base = { color: "#8B5A2B", roughness: 0.8, metalness: 0.05 };
          break;
        case "banner":
          base = { color: "#111827", roughness: 0.5, metalness: 0.2 };
          break;
        case "seg":
          base = { color: "#f3f4f6", roughness: 0.85, metalness: 0.05 };
          break;
        case "led":
          base = {
            color: "#0f172a",
            roughness: 0.35,
            metalness: 0.15,
            emissive: "#38bdf8",
            emissiveIntensity: 0.9,
          };
          break;
        case "system":
          base = { color: "#e5e7eb", roughness: 0.9, metalness: 0.05 };
          break;
        default:
          base = { color: "#e5e7eb", roughness: 0.9, metalness: 0.05 };
          break;
      }
      return pbr(base);
    },
    [pbr]
  );
  // Helper: Truss-Lichtk+Ârper je nach Typ
  const renderTrussLight = (
    key: string,
    x: number,
    y: number,
    z: number,
    lx: number,
    ly: number,
    lz: number
  ) => {
    return (
      <group key={key}>
        {trussLightType === "spot" ? (
          <mesh position={[x, y, z]} castShadow>
            <coneGeometry args={[0.07, 0.12, 10]} />
            <meshStandardMaterial
              {...pbr({
                color: "#facc15",
                emissive: "#facc15",
                emissiveIntensity: 1.2,
                roughness: 0.4,
              })}
            />
          </mesh>
        ) : (
          <mesh position={[x, y, z]} castShadow>
            <boxGeometry args={[0.14, 0.08, 0.1]} />
            <meshStandardMaterial
              {...pbr({
                color: "#fde68a",
                emissive: "#fbbf24",
                emissiveIntensity: 0.9,
                roughness: 0.35,
                metalness: 0.4,
              })}
            />
          </mesh>
        )}
        <pointLight position={[lx, ly, lz]} intensity={1.1} distance={6} decay={2} color="#fef3c7" />
      </group>
    );
  };
  // ---- Detaillierte Objekte aus Store (optional)
  const countersDetailed = useMemo(
    () => (modules.countersDetailed ?? []) as DetailedCounter[],
    [modules.countersDetailed]
  );
  const resolveCounterGeometry = useCallback(
    (ctr: DetailedCounter) => {
      const variant: CounterVariant = ctr.variant ?? (modules.counterVariant ?? "basic");
      const dims = resolveCounterSize(variant, ctr.size);
      const colliders = variant === "corner" ? cornerCounterColliders(dims.w, dims.d) : [];
      return { ...dims, variant, colliders };
    },
    [modules.counterVariant]
  );
  const buildCounterFootprint = useCallback(
    (
      ctr: DetailedCounter,
      position: { x: number; z: number },
      clearance: number,
      rotation: number
    ) => {
      const geom = resolveCounterGeometry(ctr);
      const box = makeObb(
        `ctr-d-${ctr.id}`,
        "Counter",
        position.x,
        position.z,
        geom.w,
        geom.d,
        clearance,
        rotation,
        geom.colliders
      );
      const extents = halfExtentsFromBox(box);
      return { geom, box, halfW: extents.halfW, halfD: extents.halfD };
    },
    [resolveCounterGeometry]
  );
  const screensDetailed = useMemo(
    () => (modules.detailedScreens ?? []) as DetailedScreen[],
    [modules.detailedScreens]
  );
  const chairsDetailed = useMemo(
    () => (modules.chairsDetailed ?? []) as ChairConfig[],
    [modules.chairsDetailed]
  );
  const lampsDetailed = useMemo(() => (modules.lamps ?? []) as LampConfig[], [modules.lamps]);
  const customObjects = useMemo(() => modules.customObjects ?? [], [modules.customObjects]);
  useEffect(() => {
    customObjects.forEach((obj) => {
      if (!obj?.assetUrl) return;
      try {
        useGLTF.preload(obj.assetUrl);
      } catch {
        // preload best-effort; Suspense fallback will handle runtime load
      }
    });
  }, [customObjects]);
  const sceneAabbs = useMemo(
    () => buildSceneAabbs(config, globalCollisionClearance),
    [config, globalCollisionClearance]
  );
  const [collidingKeys, setCollidingKeys] = useState<Set<string>>(new Set());
  const lastValidPositions = useRef<Record<string, { x: number; z: number }>>({});
  const groupDragSnapshot = useRef<Record<string, { x: number; z: number }>>({});
  const rememberValidPosition = useCallback((key: string, pos: { x: number; z: number }) => {
    lastValidPositions.current = { ...lastValidPositions.current, [key]: pos };
  }, []);
  const setCollisionState = useCallback(
    (key: string, collided: boolean) => {
      setCollidingKeys((prev) => {
        const alreadyColliding = prev.has(key);
        if ((collided && alreadyColliding) || (!collided && !alreadyColliding)) return prev;
        const next = new Set(prev);
        if (collided) next.add(key);
        else next.delete(key);
        setInteractionCollision(next.size > 0 ? true : false);
        onDebugEvent?.({
          title: collided ? "Collision detected" : "Collision cleared",
          details: key,
          meta: { active: Array.from(next).sort() },
          level: collided ? "warn" : "info",
        });
        return next;
      });
    },
    [onDebugEvent, setInteractionCollision]
  );
  const shiftObb = useCallback((box: Obb, dx: number, dz: number): Obb => {
    const shiftColliders = box.colliders?.map((c) => ({
      ...c,
      center: { x: c.centerX + dx, z: c.centerZ + dz },
      centerX: c.centerX + dx,
      centerZ: c.centerZ + dz,
      minX: c.minX + dx,
      maxX: c.maxX + dx,
      minZ: c.minZ + dz,
      maxZ: c.maxZ + dz,
    }));
    return {
      ...box,
      center: { x: box.centerX + dx, z: box.centerZ + dz },
      centerX: box.centerX + dx,
      centerZ: box.centerZ + dz,
      minX: box.minX + dx,
      maxX: box.maxX + dx,
      minZ: box.minZ + dz,
      maxZ: box.maxZ + dz,
      colliders: shiftColliders,
    };
  }, []);

  const resolveGroupDelta = useCallback(
    (leadId: string, delta: { x: number; z: number }): { x: number; z: number } => {
      const ids = selectionIds.length > 0 ? selectionIds : leadId ? [leadId] : [];
      if (ids.length <= 1) return delta;
      const selected = new Set(ids);
      const movedBoxes: Obb[] = [];
      const staticBoxes: Obb[] = [];
      sceneAabbs.forEach((box) => {
        if (selected.has(box.id) || (box.parentId && selected.has(box.parentId))) {
          movedBoxes.push(box);
        } else {
          staticBoxes.push(box);
        }
      });

      if (movedBoxes.length === 0) return delta;

      const collidesWithDelta = (scale: number) => {
        const dx = delta.x * scale;
        const dz = delta.z * scale;
        const shifted = movedBoxes.map((b) => shiftObb(b, dx, dz));
        for (const a of shifted) {
          const partsA = a.colliders?.length ? a.colliders : [a];
          for (const partA of partsA) {
            for (const b of staticBoxes) {
              const partsB = b.colliders?.length ? b.colliders : [b];
              for (const partB of partsB) {
                if (intersectObb(partA, partB)) return true;
              }
            }
          }
        }
        return false;
      };

      if (!collidesWithDelta(1)) return delta;

      let low = 0;
      let high = 1;
      for (let i = 0; i < 14; i += 1) {
        const mid = (low + high) / 2;
        if (collidesWithDelta(mid)) {
          high = mid;
        } else {
          low = mid;
        }
      }
      return { x: delta.x * low, z: delta.z * low };
    },
    [sceneAabbs, selectionIds, shiftObb]
  );
  const resolvePredictiveMove = useCallback(
    (
      key: string,
      target: { x: number; z: number },
      build: (pos: { x: number; z: number }) => ReturnType<typeof makeObb>[],
      options: { ignoreIds?: string[]; fallback?: { x: number; z: number } } = {}
    ) => {
      const ignored = new Set<string>([key, ...(options.ignoreIds ?? [])]);
      const fallback = lastValidPositions.current[key] ?? options.fallback ?? target;
      const direct = findCollisionForMany(build(target), sceneAabbs, ignored);
      if (!direct.collided) {
        rememberValidPosition(key, target);
        setCollisionState(key, false);
        return { position: target, collided: false };
      }

      const dx = target.x - fallback.x;
      const dz = target.z - fallback.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1e-4) {
        setCollisionState(key, true);
        return { position: fallback, collided: true };
      }

      let best = fallback;
      let low = 0;
      let high = 1;
      for (let i = 0; i < 16; i += 1) {
        const mid = (low + high) / 2;
        const probe = { x: fallback.x + dx * mid, z: fallback.z + dz * mid };
        const hit = findCollisionForMany(build(probe), sceneAabbs, ignored);
        if (hit.collided) {
          high = mid;
        } else {
          best = probe;
          low = mid;
        }
      }
      const bestHit = findCollisionForMany(build(best), sceneAabbs, ignored);
      if (!bestHit.collided) rememberValidPosition(key, best);
      setCollisionState(key, bestHit.collided);
      return { position: best, collided: direct.collided };
    },
    [rememberValidPosition, sceneAabbs, setCollisionState]
  );

  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [draggedSize, setDraggedSize] = useState<{
    w: number;
    d: number;
    clearance: number;
    rotation?: number;
    colliders?: ColliderSpec[];
  } | null>(null);
  const [snapMarkers, setSnapMarkers] = useState<{ x: number; z: number; type: "wall" | "truss" }[]>([]);

  const resolvePositionForKey = useCallback(
    (key: string): { x: number; z: number } | null => {
      if (key === "cabin") return { x: cabinPosX, z: cabinPosZ };
      if (key === "truss") return { x: trussOffsetX, z: trussOffsetZ };
      const counter = countersDetailed.find((ctr) => `ctr-d-${ctr.id}` === key);
      if (counter?.position) return { x: counter.position.x ?? 0, z: counter.position.z ?? 0 };
      const screen = screensDetailed.find((scr) => `scr-d-${scr.id}` === key);
      if (screen?.position) return { x: screen.position.x ?? 0, z: screen.position.z ?? 0 };
      for (let i = 0; i < chairsDetailed.length; i += 1) {
        const seat = chairsDetailed[i];
        const seatId = seat.id ?? `${i}`;
        if (`seat-${seatId}` === key && seat.position) {
          return { x: seat.position.x ?? 0, z: seat.position.z ?? 0 };
        }
      }
      for (let i = 0; i < customObjects.length; i += 1) {
        const obj = customObjects[i];
        const objId = obj.id ?? `${i}`;
        if (`custom-${objId}` === key && obj.position) {
          return { x: obj.position.x ?? 0, z: obj.position.z ?? 0 };
        }
      }
      for (let i = 0; i < lampsDetailed.length; i += 1) {
        const lamp = lampsDetailed[i];
        const lampId = lamp.id ?? `${i}`;
        if (`lamp-${lampId}` === key && lamp.position) {
          return { x: lamp.position.x ?? 0, z: lamp.position.z ?? 0 };
        }
      }
      return null;
    },
    [
      cabinPosX,
      cabinPosZ,
      chairsDetailed,
      countersDetailed,
      customObjects,
      lampsDetailed,
      screensDetailed,
      trussOffsetX,
      trussOffsetZ,
    ]
  );

  const startDrag = useCallback(
    (key: string, size: { w: number; d: number; clearance: number; rotation?: number; colliders?: ColliderSpec[] }) => {
      setDraggedKey(key);
      setDraggedSize(size);
      const activeIds = selectionIds.length > 0 && selectionIds.includes(key) ? selectionIds : [key];
      const snapshot: Record<string, { x: number; z: number }> = {};
      activeIds.forEach((id) => {
        const pos = resolvePositionForKey(id);
        if (pos) {
          snapshot[id] = pos;
        }
      });
      if (snapshot[key]) {
        rememberValidPosition(key, snapshot[key]);
      }
      groupDragSnapshot.current = snapshot;
      disableOrbit();
    },
    [disableOrbit, rememberValidPosition, resolvePositionForKey, selectionIds]
  );

  const endDrag = useCallback(() => {
    setDraggedKey(null);
    setDraggedSize(null);
    setSnapMarkers([]);
    groupDragSnapshot.current = {};
    enableOrbit();
  }, [enableOrbit]);

  const applyGroupDelta = useCallback(
    (leaderKey: string, delta: { x: number; z: number }) => {
      const followers = selectionIds.filter((id) => id !== leaderKey);
      if (followers.length === 0) return;

      let nextCounters = countersDetailed;
      let countersChanged = false;
      let nextScreens = screensDetailed;
      let screensChanged = false;
      let nextChairs = chairsDetailed;
      let chairsChanged = false;
      let nextCustom = customObjects;
      let customChanged = false;
      let nextLamps = lampsDetailed;
      let lampsChanged = false;
      let nextCabin = cabin;
      let cabinChanged = false;
      let trussOffset = modules.trussOffset ?? { x: trussOffsetX, z: trussOffsetZ };
      let trussChanged = false;

      followers.forEach((fid) => {
        if (fid.startsWith("ctr-d-")) {
          const ctr = countersDetailed.find((c) => `ctr-d-${c.id}` === fid);
          if (!ctr) return;
          const base = groupDragSnapshot.current[fid] ?? { x: ctr.position?.x ?? 0, z: ctr.position?.z ?? 0 };
          const target = { x: base.x + delta.x, z: base.z + delta.z };
          const counterRotation = ctr.rotationY ?? 0;
          const counterClearance = clearanceFor("counter", ctr.clearance);
          const footprint = buildCounterFootprint(ctr, target, counterClearance, counterRotation);
          const clamped = clampXZ(target.x, target.z, width, depth, footprint.halfW, footprint.halfD);
          const result = resolvePredictiveMove(
            fid,
            clamped,
            (p) =>
              [
                makeObb(
                  fid,
                  "Counter",
                  p.x,
                  p.z,
                  footprint.geom.w,
                  footprint.geom.d,
                  counterClearance,
                  counterRotation,
                  footprint.geom.colliders
                ),
              ],
            { fallback: base }
          );
          nextCounters = nextCounters.map((c0) =>
            c0.id === ctr.id ? { ...c0, position: { ...c0.position, x: result.position.x, z: result.position.z } } : c0
          );
          countersChanged = true;
          return;
        }

        if (fid.startsWith("scr-d-")) {
          const scr = screensDetailed.find((s) => `scr-d-${s.id}` === fid);
          if (!scr) return;
          const w = scr.size?.w ?? 0.9;
          const h = scr.size?.h ?? 1.2;
          const t = scr.size?.t ?? 0.02;
          const thickness = Math.max(t, 0.05);
          const mount = scr.mount ?? "wall";
          const side = scr.wallSide ?? "back";
          const footprintDepth = mount === "wall" ? thickness : mount === "floor" ? t || 0.1 : w * 0.25;
          const screenClearance = clearanceFor("screen", scr.clearance);
          const base = groupDragSnapshot.current[fid] ?? { x: scr.position?.x ?? 0, z: scr.position?.z ?? 0 };
          let desiredX = base.x + delta.x;
          let desiredZ = base.z + delta.z;
          let rot = scr.rotationY ?? 0;
          if (mount === "wall") {
            if (side === "back") {
              const c = clampXZ(desiredX, backWallFrontZ, width, depth, w / 2, 0.001);
              desiredX = c.x;
              desiredZ = backWallFrontZ;
              rot = 0;
            } else if (side === "left") {
              const c = clampXZ(leftWallInnerX, desiredZ, width, depth, 0.001, h / 2);
              desiredX = leftWallInnerX;
              desiredZ = c.z;
              rot = Math.PI / 2;
            } else {
              const c = clampXZ(rightWallInnerX, desiredZ, width, depth, 0.001, h / 2);
              desiredX = rightWallInnerX;
              desiredZ = c.z;
              rot = -Math.PI / 2;
            }
          } else {
            const c = clampXZ(desiredX, desiredZ, width, depth, w / 2, footprintDepth / 2);
            desiredX = c.x;
            desiredZ = c.z;
          }
          const result = resolvePredictiveMove(
            fid,
            { x: desiredX, z: desiredZ },
            (p) => [makeObb(fid, "Screen", p.x, p.z, w, footprintDepth, screenClearance, rot)],
            { fallback: base }
          );
          nextScreens = nextScreens.map((s0) =>
            s0.id === scr.id
              ? { ...s0, position: { x: result.position.x, z: result.position.z }, rotationY: rot, wallSide: scr.wallSide }
              : s0
          );
          screensChanged = true;
          return;
        }

        if (fid.startsWith("seat-")) {
          const seat = chairsDetailed.find((s, idx) => (s.id ?? `${idx}`) === fid.replace("seat-", ""));
          if (!seat) return;
          const dims = resolveSeatingGeometry(seat.type ?? "chair", seat.footprint, seat.seatHeight, seat.backHeight);
          const seatClearance = clearanceFor("chair", seat.clearance);
          const rotY = seat.rotationY ?? 0;
          const base = groupDragSnapshot.current[fid] ?? { x: seat.position?.x ?? 0, z: seat.position?.z ?? 0 };
          const target = { x: base.x + delta.x, z: base.z + delta.z };
          const clamped = clampXZ(target.x, target.z, width, depth, dims.w / 2, dims.d / 2);
          const result = resolvePredictiveMove(
            fid,
            clamped,
            (p) => [makeObb(fid, "Sitzmoebel", p.x, p.z, dims.w, dims.d, seatClearance, rotY)],
            { fallback: base }
          );
          nextChairs = nextChairs.map((c0, cIdx) => {
            const currentId = c0.id ?? `${cIdx}`;
            if (`seat-${currentId}` !== fid) return c0;
            return { ...c0, position: { ...c0.position, x: result.position.x, z: result.position.z } };
          });
          chairsChanged = true;
          return;
        }

        if (fid.startsWith("custom-")) {
          const obj = customObjects.find((o, idx) => `custom-${o.id ?? `${idx}`}` === fid);
          if (!obj) return;
          const w = Math.max(0, obj.footprint?.w ?? 1);
          const d = Math.max(0, obj.footprint?.d ?? 1);
          const base = groupDragSnapshot.current[fid] ?? { x: obj.position?.x ?? 0, z: obj.position?.z ?? 0 };
          const target = { x: base.x + delta.x, z: base.z + delta.z };
          const rot = obj.rotationY ?? 0;
          const objClearance = clearanceFor("custom", obj.clearance);
          const clamped = clampXZ(target.x, target.z, width, depth, w / 2, d / 2);
          const result = resolvePredictiveMove(
            fid,
            clamped,
            (p) => [makeObb(fid, obj.name ?? "Custom 3D", p.x, p.z, w, d, objClearance, rot)],
            { fallback: base }
          );
          nextCustom = nextCustom.map((o, idx) => {
            const currentKey = `custom-${o.id ?? `${idx}`}`;
            if (currentKey !== fid) return o;
            return { ...o, position: { ...o.position, x: result.position.x, z: result.position.z } };
          });
          customChanged = true;
          return;
        }

        if (fid.startsWith("lamp-")) {
          const lamp = lampsDetailed.find((l, idx) => (l.id ?? `${idx}`) === fid.replace("lamp-", ""));
          if (!lamp) return;
          const w = Math.max(0, lamp.footprint?.w ?? 0.25);
          const d = Math.max(0, lamp.footprint?.d ?? 0.25);
          const base = groupDragSnapshot.current[fid] ?? { x: lamp.position?.x ?? 0, z: lamp.position?.z ?? 0 };
          const target = { x: base.x + delta.x, z: base.z + delta.z };
          const clamped = clampXZ(target.x, target.z, width, depth, w / 2, d / 2);
          const lampClearance = clearanceFor("custom", lamp.clearance);
          const result = resolvePredictiveMove(
            fid,
            clamped,
            (p) => [makeObb(fid, lamp.name ?? "Lampe", p.x, p.z, w, d, lampClearance, lamp.rotationY ?? 0)],
            { fallback: base }
          );
          nextLamps = nextLamps.map((l, idx) => {
            const currentId = l.id ?? `${idx}`;
            if (currentId !== lamp.id) return l;
            return { ...l, position: { ...l.position, x: result.position.x, z: result.position.z } };
          });
          lampsChanged = true;
          return;
        }

        if (fid === "cabin" && cabin) {
          const base = groupDragSnapshot.current[fid] ?? { x: cabin.position?.x ?? cabinPosX, z: cabin.position?.z ?? cabinPosZ };
          const cabinClearance = clearanceFor("cabin", cabin.clearance);
          const cabinRotation = cabin.rotationY ?? 0;
          const target = { x: base.x + delta.x, z: base.z + delta.z };
          const clamped = clampXZ(target.x, target.z, width, depth, cabinWidth / 2, cabinDepth / 2);
          const result = resolvePredictiveMove(
            fid,
            clamped,
            (p) => [makeObb(fid, "Kabine", p.x, p.z, cabinWidth, cabinDepth, cabinClearance, cabinRotation)],
            { fallback: base }
          );
          nextCabin = {
            ...cabin,
            position: { x: result.position.x, z: result.position.z },
          };
          cabinChanged = true;
          return;
        }

        if (fid === "truss" && trussEnabled) {
          const base = groupDragSnapshot.current[fid] ?? { x: trussOffsetX, z: trussOffsetZ };
          const target = { x: base.x + delta.x, z: base.z + delta.z };
          const clamped = clampXZ(target.x, target.z, width, depth, 0.4, 0.4);
          trussOffset = clamped;
          trussChanged = true;
        }
      });

      const patch: Partial<typeof modules> = {};
      if (countersChanged) patch.countersDetailed = nextCounters;
      if (screensChanged) patch.detailedScreens = nextScreens;
      if (chairsChanged) patch.chairsDetailed = nextChairs;
      if (customChanged) patch.customObjects = nextCustom;
      if (lampsChanged) patch.lamps = nextLamps;
      if (cabinChanged && nextCabin) patch.cabin = nextCabin;
      if (trussChanged) patch.trussOffset = trussOffset;
      if (Object.keys(patch).length > 0) {
        setConfig({ modules: patch });
      }
    },
    [
      cabin,
      cabinPosX,
      cabinPosZ,
      chairsDetailed,
      clearanceFor,
      buildCounterFootprint,
      countersDetailed,
      depth,
      leftWallInnerX,
      modules,
      resolvePredictiveMove,
      rightWallInnerX,
      screensDetailed,
      selectionIds,
      setConfig,
      trussEnabled,
      trussOffsetX,
      trussOffsetZ,
      width,
      backWallFrontZ,
    ]
  );

  const handleSelectKey = useCallback(
    (event: ThreeEvent<MouseEvent>, key: string, objectType?: string) => {
      event.stopPropagation();
      const selectionType = objectType ?? selectionTypeFromKey(key);
      const additive = event.nativeEvent.metaKey || event.nativeEvent.ctrlKey || event.nativeEvent.shiftKey;
      if (additive) {
        const alreadySelected = selectionIds.includes(key);
        const nextIds = alreadySelected ? selectionIds.filter((id) => id !== key) : [...selectionIds, key];
        setSelectedKey(nextIds.length > 0 ? nextIds[nextIds.length - 1] : null);
        setInteractionSelection(nextIds, { selectionType, objectType: selectionType });
        return;
      }
      setSelectedKey(key);
      setInteractionSelection([key], { selectionType, objectType: selectionType });
    },
    [selectionIds, setInteractionSelection, setSelectedKey]
  );

  const alignSelection = useCallback(
    (mode: "x" | "z" | "back") => {
      const ids = selectionIds.length > 0 ? selectionIds : selectedKey ? [selectedKey] : [];
      if (ids.length === 0) return false;
      const positions = ids
        .map((id) => ({ id, pos: resolvePositionForKey(id) }))
        .filter((p): p is { id: string; pos: { x: number; z: number } } => Boolean(p.pos));
      if (positions.length === 0) return false;
      const refZ =
        mode === "back"
          ? backWallFrontZ
          : mode === "x"
          ? positions.reduce((acc, p) => acc + p.pos.z, 0) / positions.length
          : undefined;
      const refX = mode === "z" ? positions.reduce((acc, p) => acc + p.pos.x, 0) / positions.length : undefined;

      let changed = false;
      let nextCounters = countersDetailed;
      let countersChanged = false;
      let nextScreens = screensDetailed;
      let screensChanged = false;
      let nextChairs = chairsDetailed;
      let chairsChanged = false;
      let nextCustom = customObjects;
      let customChanged = false;
      let nextCabin = cabin;
      let cabinChanged = false;
      let trussOffset = modules.trussOffset ?? { x: trussOffsetX, z: trussOffsetZ };
      let trussChanged = false;

      ids.forEach((fid) => {
        if (fid.startsWith("ctr-d-")) {
          const ctr = countersDetailed.find((c) => `ctr-d-${c.id}` === fid);
          if (!ctr) return;
          const base = resolvePositionForKey(fid) ?? { x: 0, z: 0 };
          const target = { x: refX ?? base.x, z: refZ ?? base.z };
          const counterRotation = ctr.rotationY ?? 0;
          const counterClearance = clearanceFor("counter", ctr.clearance);
          const footprint = buildCounterFootprint(ctr, target, counterClearance, counterRotation);
          const clamped = clampXZ(target.x, target.z, width, depth, footprint.halfW, footprint.halfD);
          const result = resolvePredictiveMove(
            fid,
            clamped,
            (p) =>
              [
                makeObb(
                  fid,
                  "Counter",
                  p.x,
                  p.z,
                  footprint.geom.w,
                  footprint.geom.d,
                  counterClearance,
                  counterRotation,
                  footprint.geom.colliders
                ),
              ],
            { fallback: base }
          );
          nextCounters = nextCounters.map((c0) =>
            c0.id === ctr.id ? { ...c0, position: { ...c0.position, x: result.position.x, z: result.position.z } } : c0
          );
          countersChanged = true;
          changed = true;
          return;
        }

        if (fid.startsWith("scr-d-")) {
          const scr = screensDetailed.find((s) => `scr-d-${s.id}` === fid);
          if (!scr) return;
          const w = scr.size?.w ?? 0.9;
          const h = scr.size?.h ?? 1.2;
          const t = scr.size?.t ?? 0.02;
          const thickness = Math.max(t, 0.05);
          const mount = scr.mount ?? "wall";
          const side = scr.wallSide ?? "back";
          const footprintDepth = mount === "wall" ? thickness : mount === "floor" ? t || 0.1 : w * 0.25;
          const screenClearance = clearanceFor("screen", scr.clearance);
          const base = resolvePositionForKey(fid) ?? { x: 0, z: 0 };
          let desiredX = refX ?? base.x;
          let desiredZ = refZ ?? base.z;
          let rot = scr.rotationY ?? 0;
          if (mount === "wall") {
            if (side === "back") {
              const c = clampXZ(desiredX, backWallFrontZ, width, depth, w / 2, 0.001);
              desiredX = c.x;
              desiredZ = backWallFrontZ;
              rot = 0;
            } else if (side === "left") {
              const c = clampXZ(leftWallInnerX, desiredZ, width, depth, 0.001, h / 2);
              desiredX = leftWallInnerX;
              desiredZ = c.z;
              rot = Math.PI / 2;
            } else {
              const c = clampXZ(rightWallInnerX, desiredZ, width, depth, 0.001, h / 2);
              desiredX = rightWallInnerX;
              desiredZ = c.z;
              rot = -Math.PI / 2;
            }
          } else {
            const c = clampXZ(desiredX, desiredZ, width, depth, w / 2, footprintDepth / 2);
            desiredX = c.x;
            desiredZ = c.z;
          }
          const result = resolvePredictiveMove(
            fid,
            { x: desiredX, z: desiredZ },
            (p) => [makeObb(fid, "Screen", p.x, p.z, w, footprintDepth, screenClearance, rot)],
            { fallback: base }
          );
          nextScreens = nextScreens.map((s0) =>
            s0.id === scr.id
              ? { ...s0, position: { x: result.position.x, z: result.position.z }, rotationY: rot, wallSide: scr.wallSide }
              : s0
          );
          screensChanged = true;
          changed = true;
          return;
        }

        if (fid.startsWith("seat-")) {
          const seat = chairsDetailed.find((s, idx) => (s.id ?? `${idx}`) === fid.replace("seat-", ""));
          if (!seat) return;
          const dims = resolveSeatingGeometry(seat.type ?? "chair", seat.footprint, seat.seatHeight, seat.backHeight);
          const seatClearance = clearanceFor("chair", seat.clearance);
          const rotY = seat.rotationY ?? 0;
          const base = resolvePositionForKey(fid) ?? { x: 0, z: 0 };
          const target = { x: refX ?? base.x, z: refZ ?? base.z };
          const clamped = clampXZ(target.x, target.z, width, depth, dims.w / 2, dims.d / 2);
          const result = resolvePredictiveMove(
            fid,
            clamped,
            (p) => [makeObb(fid, "Sitzmoebel", p.x, p.z, dims.w, dims.d, seatClearance, rotY)],
            { fallback: base }
          );
          nextChairs = nextChairs.map((c0, cIdx) => {
            const currentId = c0.id ?? `${cIdx}`;
            if (`seat-${currentId}` !== fid) return c0;
            return { ...c0, position: { ...c0.position, x: result.position.x, z: result.position.z } };
          });
          chairsChanged = true;
          changed = true;
          return;
        }

        if (fid.startsWith("custom-")) {
          const obj = customObjects.find((o, idx) => `custom-${o.id ?? `${idx}`}` === fid);
          if (!obj) return;
          const w = Math.max(0, obj.footprint?.w ?? 1);
          const d = Math.max(0, obj.footprint?.d ?? 1);
          const base = resolvePositionForKey(fid) ?? { x: 0, z: 0 };
          const target = { x: refX ?? base.x, z: refZ ?? base.z };
          const rot = obj.rotationY ?? 0;
          const objClearance = clearanceFor("custom", obj.clearance);
          const clamped = clampXZ(target.x, target.z, width, depth, w / 2, d / 2);
          const result = resolvePredictiveMove(
            fid,
            clamped,
            (p) => [makeObb(fid, obj.name ?? "Custom 3D", p.x, p.z, w, d, objClearance, rot)],
            { fallback: base }
          );
          nextCustom = nextCustom.map((o, idx) => {
            const currentKey = `custom-${o.id ?? `${idx}`}`;
            if (currentKey !== fid) return o;
            return { ...o, position: { ...o.position, x: result.position.x, z: result.position.z } };
          });
          customChanged = true;
          changed = true;
          return;
        }

        if (fid === "cabin" && cabin) {
          const base = resolvePositionForKey(fid) ?? { x: cabinPosX, z: cabinPosZ };
          const cabinClearance = clearanceFor("cabin", cabin.clearance);
          const cabinRotation = cabin.rotationY ?? 0;
          const target = { x: refX ?? base.x, z: refZ ?? base.z };
          const clamped = clampXZ(target.x, target.z, width, depth, cabinWidth / 2, cabinDepth / 2);
          const result = resolvePredictiveMove(
            fid,
            clamped,
            (p) => [makeObb(fid, "Kabine", p.x, p.z, cabinWidth, cabinDepth, cabinClearance, cabinRotation)],
            { fallback: base }
          );
          nextCabin = {
            ...cabin,
            position: { x: result.position.x, z: result.position.z },
          };
          cabinChanged = true;
          changed = true;
          return;
        }

        if (fid === "truss" && trussEnabled) {
          const base = resolvePositionForKey(fid) ?? { x: trussOffsetX, z: trussOffsetZ };
          const target = { x: refX ?? base.x, z: refZ ?? base.z };
          const clamped = clampXZ(target.x, target.z, width, depth, 0.4, 0.4);
          trussOffset = clamped;
          trussChanged = true;
          changed = true;
        }
      });

      if (!changed) return false;
      const patch: Partial<typeof modules> = {};
      if (countersChanged) patch.countersDetailed = nextCounters;
      if (screensChanged) patch.detailedScreens = nextScreens;
      if (chairsChanged) patch.chairsDetailed = nextChairs;
      if (customChanged) patch.customObjects = nextCustom;
      if (cabinChanged && nextCabin) patch.cabin = nextCabin;
      if (trussChanged) patch.trussOffset = trussOffset;
      if (Object.keys(patch).length > 0) {
        setConfig({ modules: patch });
      }
      return true;
    },
    [
      backWallFrontZ,
      cabin,
      cabinDepth,
      cabinPosX,
      cabinPosZ,
      cabinWidth,
      chairsDetailed,
      clearanceFor,
      customObjects,
      countersDetailed,
      depth,
      leftWallInnerX,
      modules,
      resolvePositionForKey,
      resolvePredictiveMove,
      rightWallInnerX,
      screensDetailed,
      selectedKey,
      selectionIds,
      setConfig,
      trussEnabled,
      trussOffsetX,
      trussOffsetZ,
      width,
    ]
  );

  const collisionHotIds = useMemo(() => {
    const hot = new Set<string>();
    sceneAabbs.forEach((box, idx) => {
      const others = sceneAabbs.filter((_, i) => i !== idx);
      const hit = findCollisionForMany([box], others, new Set([box.id]));
      if (hit.collided && hit.hit) {
        hot.add(box.id);
        hot.add(hit.hit.id);
      }
    });
    collidingKeys.forEach((k) => hot.add(k));
    return hot;
  }, [collidingKeys, sceneAabbs]);

  const placementHint = useMemo(() => {
    if (!draggedKey || !draggedSize) return null;
    const pos = resolvePositionForKey(draggedKey);
    if (!pos) return null;
    const rot = draggedSize.rotation ?? 0;
    const obb = makeObb(
      "hint",
      "hint",
      pos.x,
      pos.z,
      draggedSize.w,
      draggedSize.d,
      draggedSize.clearance,
      rot,
      draggedSize.colliders ?? []
    );
    const halfW = (obb.maxX - obb.minX) / 2;
    const halfD = (obb.maxZ - obb.minZ) / 2;
    const bounds = { left: -width / 2, right: width / 2, back: -depth / 2, front: depth / 2 };
    const xLeft = pos.x - halfW;
    const xRight = pos.x + halfW;
    const zBack = pos.z - halfD;
    const zFront = pos.z + halfD;
    return {
      key: draggedKey,
      pos,
      size: draggedSize,
      halfW,
      halfD,
      rotation: rot,
      bounds,
      distances: {
        left: xLeft - bounds.left,
        right: bounds.right - xRight,
        back: zBack - bounds.back,
        front: bounds.front - zFront,
      },
      colliding: collidingKeys.has(draggedKey),
    };
  }, [
    collidingKeys,
    draggedKey,
    draggedSize,
    resolvePositionForKey,
    width,
    depth,
  ]);

  useEffect(() => {
    if (!editMode && draggedKey) {
      setDraggedKey(null);
      setDraggedSize(null);
      enableOrbit();
    }
  }, [draggedKey, editMode, enableOrbit]);
  // initial g++ltige Positionen merken (Rollback bei Kollision)
  useEffect(() => {
    const next: Record<string, { x: number; z: number }> = {};
    countersDetailed.forEach((ctr) => {
      next[`ctr-d-${ctr.id}`] = {
        x: ctr.position?.x ?? 0,
        z: ctr.position?.z ?? 0,
      };
    });
    screensDetailed.forEach((scr) => {
      next[`scr-d-${scr.id}`] = {
        x: scr.position?.x ?? 0,
        z: scr.position?.z ?? 0,
      };
    });
    chairsDetailed.forEach((seat, idx) => {
      const seatId = seat.id ?? `${idx}`;
      next[`seat-${seatId}`] = {
        x: seat.position?.x ?? 0,
        z: seat.position?.z ?? 0,
      };
    });
    customObjects.forEach((obj, idx) => {
      const objId = obj.id ?? `${idx}`;
      next[`custom-${objId}`] = {
        x: obj.position?.x ?? 0,
        z: obj.position?.z ?? 0,
      };
    });
    lampsDetailed.forEach((lamp, idx) => {
      const lampId = lamp.id ?? `${idx}`;
      next[`lamp-${lampId}`] = {
        x: lamp.position?.x ?? 0,
        z: lamp.position?.z ?? 0,
      };
    });
    if (cabinEnabled) {
      next.cabin = { x: cabinPosX, z: cabinPosZ };
    }
    if (trussEnabled) {
      next.truss = { x: trussOffsetX, z: trussOffsetZ };
    }
    lastValidPositions.current = next;
  }, [
    cabinEnabled,
    cabinPosX,
    cabinPosZ,
    countersDetailed,
    screensDetailed,
    chairsDetailed,
    customObjects,
    lampsDetailed,
    trussEnabled,
    trussOffsetX,
    trussOffsetZ,
  ]);
  const handleGroundContextMenu = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      event.nativeEvent?.preventDefault?.();
      setSelectedKey(null);
      clearInteractionSelection();
      closeContextMenu();
      const mousePosition = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
      const selectionCenter: [number, number, number] = [event.point.x, event.point.y, event.point.z];
      setInteractionMousePosition(mousePosition);
      setInteractionSelectionCenter(selectionCenter);
      const menu = buildContextMenu(
        getInteractionContext({
          objectId: undefined,
          objectType: undefined,
          selectionIds: [],
          selectionType: undefined,
          mousePosition,
          selectionCenter,
        })
      );
      onDebugEvent?.({
        title: "Context menu",
        details: "Scene root",
        meta: { mousePosition, selectionCenter },
      });
      openContextMenu({ ...menu, position: mousePosition });
    },
    [
      clearInteractionSelection,
      closeContextMenu,
      getInteractionContext,
      onDebugEvent,
      openContextMenu,
      setInteractionMousePosition,
      setInteractionSelectionCenter,
    ]
  );
  const openContextMenuForSelection = useCallback(
    (event: ThreeEvent<MouseEvent>, key: string, objectType?: string) => {
      event.stopPropagation();
      event.nativeEvent?.preventDefault?.();
      const selectionType = objectType ?? selectionTypeFromKey(key);
      if (selectedKey !== key) {
        setSelectedKey(key);
      }
      setInteractionSelection([key], { selectionType, objectType: selectionType });
      const mousePosition = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
      const center = selectionCenterOf(key) ?? [event.point.x, event.point.y, event.point.z] as [number, number, number];
      setInteractionMousePosition(mousePosition);
      setInteractionSelectionCenter(center);
      const menu = buildContextMenu(
        getInteractionContext({
          objectId: key,
          objectType: selectionType,
          selectionIds: [key],
          selectionType,
          selectionCount: 1,
          mousePosition,
          selectionCenter: center,
        })
      );
      onDebugEvent?.({
        title: "Context menu",
        details: key,
        meta: { selectionType, mousePosition, selectionCenter: center },
      });
      openContextMenu({ ...menu, position: mousePosition });
    },
    [
      getInteractionContext,
      onDebugEvent,
      openContextMenu,
      selectionCenterOf,
      setInteractionMousePosition,
      setInteractionSelection,
      setInteractionSelectionCenter,
      setSelectedKey,
      selectedKey,
    ]
  );
  const duplicateSelectionByKey = useCallback(
    (key?: string | null) => {
      if (!key) return false;
      if (key.startsWith("ctr-d-")) {
        const id = key.replace("ctr-d-", "");
        const ctr = countersDetailed.find((c) => c.id === id);
        if (!ctr) return false;
        const geom = resolveCounterGeometry(ctr);
        const baseX = ctr.position?.x ?? 0;
        const baseZ = ctr.position?.z ?? 0;
        const counterClearance = clearanceFor("counter", ctr.clearance);
        const footprint = buildCounterFootprint(
          ctr,
          { x: baseX + 0.25, z: baseZ + 0.25 },
          counterClearance,
          ctr.rotationY ?? 0
        );
        const offset = clampXZ(baseX + 0.25, baseZ + 0.25, width, depth, footprint.halfW, footprint.halfD);
        const nextId = `${ctr.id}-copy-${Date.now()}`;
        const next = [
          ...countersDetailed,
          { ...ctr, id: nextId, position: { x: offset.x, z: offset.z }, size: { w: geom.w, d: geom.d, h: geom.h } },
        ];
        setConfig({ modules: { countersDetailed: next } });
        onDebugEvent?.({
          title: "Duplicated counter",
          details: nextId,
          meta: { from: key, position: offset },
        });
        return true;
      }
      if (key.startsWith("scr-d-")) {
        const id = key.replace("scr-d-", "");
        const scr = screensDetailed.find((s) => s.id === id);
        if (!scr) return false;
        const w = scr.size?.w ?? 0.9;
        const t = scr.size?.t ?? 0.02;
        const side = scr.wallSide ?? scr.lastWallSide ?? screensWallSide;
        let nextX = (scr.position?.x ?? 0) + (side === "back" ? 0.25 : 0.25);
        let nextZ = (scr.position?.z ?? 0) + (side === "left" ? 0.25 : side === "right" ? -0.25 : 0.25);
        if (scr.mount === "wall") {
          if (side === "back") {
            nextZ = backWallFrontZ;
            nextX = clampXZ(nextX, nextZ, width, depth, w / 2, 0.001).x;
          } else if (side === "left") {
            nextX = leftWallInnerX;
            nextZ = clampXZ(nextX, nextZ, width, depth, 0.001, w / 2).z;
          } else if (side === "right") {
            nextX = rightWallInnerX;
            nextZ = clampXZ(nextX, nextZ, width, depth, 0.001, w / 2).z;
          }
        } else {
          const snapped = clampXZ(nextX, nextZ, width, depth, w / 2, t / 2);
          nextX = snapped.x;
          nextZ = snapped.z;
        }
        const nextId = `${scr.id}-copy-${Date.now()}`;
        const next = [...screensDetailed, { ...scr, id: nextId, position: { x: nextX, z: nextZ } }];
        setConfig({ modules: { detailedScreens: next } });
        onDebugEvent?.({
          title: "Duplicated screen",
          details: nextId,
          meta: { from: key, position: { x: nextX, z: nextZ } },
        });
        return true;
      }
      if (key.startsWith("seat-")) {
        const id = key.replace("seat-", "");
        const seat = chairsDetailed.find((s, idx) => (s.id ?? `${idx}`) === id);
        if (!seat) return false;
        const dims = resolveSeatingGeometry(seat.type ?? "chair", seat.footprint, seat.seatHeight, seat.backHeight);
        const baseX = seat.position?.x ?? 0;
        const baseZ = seat.position?.z ?? 0;
        const nextPos = clampXZ(baseX + 0.25, baseZ + 0.25, width, depth, dims.w / 2, dims.d / 2);
        const nextId = `${seat.id ?? id}-copy-${Date.now()}`;
        const next = [...chairsDetailed, { ...seat, id: nextId, position: { x: nextPos.x, z: nextPos.z } }];
        setConfig({ modules: { chairsDetailed: next } });
        onDebugEvent?.({
          title: "Duplicated seating",
          details: nextId,
          meta: { from: key, position: nextPos, type: seat.type ?? "chair" },
        });
        return true;
      }
      if (key.startsWith("custom-")) {
        const id = key.replace("custom-", "");
        const obj = customObjects.find((o, idx) => (o.id ?? `${idx}`) === id);
        if (!obj) return false;
        const w = Math.max(0, obj.footprint?.w ?? 1);
        const d = Math.max(0, obj.footprint?.d ?? 1);
        const baseX = obj.position?.x ?? 0;
        const baseZ = obj.position?.z ?? 0;
        const nextPos = clampXZ(baseX + 0.4, baseZ + 0.4, width, depth, w / 2, d / 2);
        const nextId = `${obj.id ?? id}-copy-${Date.now()}`;
        const next = [
          ...customObjects,
          {
            ...obj,
            id: nextId,
            position: { ...obj.position, x: nextPos.x, z: nextPos.z },
          },
        ];
        setConfig({ modules: { customObjects: next } });
        onDebugEvent?.({
          title: "Duplicated custom model",
          details: nextId,
          meta: { from: key, position: nextPos },
        });
        return true;
      }
      if (key.startsWith("lamp-")) {
        const id = key.replace("lamp-", "");
        const lamp = lampsDetailed.find((l, idx) => (l.id ?? `${idx}`) === id);
        if (!lamp) return false;
        const w = Math.max(0, lamp.footprint?.w ?? 0.25);
        const d = Math.max(0, lamp.footprint?.d ?? 0.25);
        const baseX = lamp.position?.x ?? 0;
        const baseZ = lamp.position?.z ?? 0;
        const nextPos = clampXZ(baseX + 0.3, baseZ + 0.3, width, depth, w / 2, d / 2);
        const nextId = `${lamp.id ?? id}-copy-${Date.now()}`;
        const next = [
          ...lampsDetailed,
          {
            ...lamp,
            id: nextId,
            position: { ...lamp.position, x: nextPos.x, z: nextPos.z },
          },
        ];
        setConfig({ modules: { lamps: next } });
        onDebugEvent?.({
          title: "Duplicated lamp",
          details: nextId,
          meta: { from: key, position: nextPos },
        });
        return true;
      }
      return false;
    },
    [
      backWallFrontZ,
      buildCounterFootprint,
      clearanceFor,
      chairsDetailed,
      countersDetailed,
      customObjects,
      depth,
      leftWallInnerX,
      lampsDetailed,
      modules.counterVariant,
      onDebugEvent,
      rightWallInnerX,
      resolveCounterGeometry,
      screensDetailed,
      screensWallSide,
      setConfig,
      width,
    ]
  );
  const resetTransformByKey = useCallback(
    (key?: string | null) => {
      if (!key) return false;
      if (key.startsWith("ctr-d-")) {
        const id = key.replace("ctr-d-", "");
        const next = countersDetailed.map((ctr) => (ctr.id === id ? { ...ctr, rotationY: 0 } : ctr));
        setConfig({ modules: { countersDetailed: next } });
        return true;
      }
    if (key.startsWith("scr-d-")) {
      const id = key.replace("scr-d-", "");
      const next = screensDetailed.map((scr) => (scr.id === id ? { ...scr, rotationY: 0 } : scr));
      setConfig({ modules: { detailedScreens: next } });
      return true;
    }
    if (key.startsWith("seat-")) {
      const id = key.replace("seat-", "");
      const next = chairsDetailed.map((seat, idx) => {
        const currentId = seat.id ?? `${idx}`;
        if (currentId !== id) return seat;
        return { ...seat, rotationY: 0 };
      });
      setConfig({ modules: { chairsDetailed: next } });
      return true;
    }
    if (key.startsWith("lamp-")) {
      const id = key.replace("lamp-", "");
      const next = lampsDetailed.map((lamp, idx) => {
        const currentId = lamp.id ?? `${idx}`;
        if (currentId !== id) return lamp;
        return { ...lamp, rotationY: 0 };
      });
      setConfig({ modules: { lamps: next } });
      return true;
    }
    if (key.startsWith("custom-")) {
      const id = key.replace("custom-", "");
      const next = customObjects.map((obj, idx) => {
        const currentId = obj.id ?? `${idx}`;
        if (currentId !== id) return obj;
          return { ...obj, rotationY: 0 };
        });
        setConfig({ modules: { customObjects: next } });
        return true;
      }
      return false;
    },
    [
      chairsDetailed,
      countersDetailed,
      customObjects,
      screensDetailed,
      setConfig,
      snapStep,
      width,
      depth,
      modules.counterVariant,
    ]
  );
  const snapSelectionByKey = useCallback(
    (key?: string | null) => {
      if (!key) return false;
      if (key.startsWith("ctr-d-")) {
        const id = key.replace("ctr-d-", "");
        const ctr = countersDetailed.find((c) => c.id === id);
        if (!ctr) return false;
        const pos = ctr.position ?? { x: 0, z: 0 };
        const counterClearance = clearanceFor("counter", ctr.clearance);
        const rotation = ctr.rotationY ?? 0;
        const target = { x: snapValue(pos.x, snapStep), z: snapValue(pos.z, snapStep) };
        const footprint = buildCounterFootprint(ctr, target, counterClearance, rotation);
        const snapped = clampXZ(target.x, target.z, width, depth, footprint.halfW, footprint.halfD);
        const next = countersDetailed.map((c) =>
          c.id === id ? { ...c, position: { x: snapped.x, z: snapped.z } } : c
        );
        setConfig({ modules: { countersDetailed: next } });
        return true;
      }
      if (key.startsWith("scr-d-")) {
        const id = key.replace("scr-d-", "");
        const scr = screensDetailed.find((s) => s.id === id);
        if (!scr) return false;
        const w = scr.size?.w ?? 0.9;
        const t = scr.size?.t ?? 0.02;
        const pos = scr.position ?? { x: 0, z: 0 };
        const snapped = clampXZ(snapValue(pos.x ?? 0, snapStep), snapValue(pos.z ?? 0, snapStep), width, depth, w / 2, t / 2);
        const next = screensDetailed.map((s) =>
          s.id === id ? { ...s, position: { x: snapped.x, z: snapped.z } } : s
        );
        setConfig({ modules: { detailedScreens: next } });
        return true;
      }
      if (key.startsWith("seat-")) {
        const id = key.replace("seat-", "");
        const seat = chairsDetailed.find((s, idx) => (s.id ?? `${idx}`) === id);
        if (!seat) return false;
        const dims = resolveSeatingGeometry(seat.type ?? "chair", seat.footprint, seat.seatHeight, seat.backHeight);
        const pos = seat.position ?? { x: 0, z: 0 };
        const snapped = clampXZ(
          snapValue(pos.x, snapStep),
          snapValue(pos.z, snapStep),
          width,
          depth,
          dims.w / 2,
          dims.d / 2
        );
        const next = chairsDetailed.map((s, idx) => {
          const currentId = s.id ?? `${idx}`;
          if (currentId !== id) return s;
          return { ...s, position: { x: snapped.x, z: snapped.z } };
        });
        setConfig({ modules: { chairsDetailed: next } });
        return true;
      }
      if (key.startsWith("lamp-")) {
        const id = key.replace("lamp-", "");
        const lamp = lampsDetailed.find((l, idx) => (l.id ?? `${idx}`) === id);
        if (!lamp) return false;
        const w = Math.max(0, lamp.footprint?.w ?? 0.25);
        const d = Math.max(0, lamp.footprint?.d ?? 0.25);
        const pos = lamp.position ?? { x: 0, z: 0 };
        const snapped = clampXZ(
          snapValue(pos.x, snapStep),
          snapValue(pos.z, snapStep),
          width,
          depth,
          w / 2,
          d / 2
        );
        const next = lampsDetailed.map((l, idx) => {
          const currentId = l.id ?? `${idx}`;
          if (currentId !== id) return l;
          return { ...l, position: { ...l.position, x: snapped.x, z: snapped.z } };
        });
        setConfig({ modules: { lamps: next } });
        return true;
      }
      if (key.startsWith("custom-")) {
        const id = key.replace("custom-", "");
        const obj = customObjects.find((o, idx) => (o.id ?? `${idx}`) === id);
        if (!obj) return false;
        const w = Math.max(0, obj.footprint?.w ?? 1);
        const d = Math.max(0, obj.footprint?.d ?? 1);
        const pos = obj.position ?? { x: 0, z: 0 };
        const snapped = clampXZ(
          snapValue(pos.x, snapStep),
          snapValue(pos.z, snapStep),
          width,
          depth,
          w / 2,
          d / 2
        );
        const next = customObjects.map((o, idx) => {
          const currentId = o.id ?? `${idx}`;
          if (currentId !== id) return o;
          return { ...o, position: { ...o.position, x: snapped.x, z: snapped.z } };
        });
        setConfig({ modules: { customObjects: next } });
        return true;
      }
      return false;
    },
    [
      buildCounterFootprint,
      chairsDetailed,
      clearanceFor,
      countersDetailed,
      customObjects,
      depth,
      modules.counterVariant,
      screensDetailed,
      setConfig,
      snapStep,
      width,
    ]
  );
  // ---- Selektion / G++ltigkeit pr++fen (falls Objekt weg ist -> deselect)
  const validSelectedKey = selectedKey;
  const isSelected = (key: string) => validSelectedKey === key;
  const firstSelectableKey = useMemo(() => {
    if (countersDetailed.length > 0) return `ctr-d-${countersDetailed[0].id}`;
    if (screensDetailed.length > 0) return `scr-d-${screensDetailed[0].id}`;
    if (chairsDetailed.length > 0) {
      const firstId = chairsDetailed[0].id ?? "0";
      return `seat-${firstId}`;
    }
    if (lampsDetailed.length > 0) {
      const firstId = lampsDetailed[0].id ?? "0";
      return `lamp-${firstId}`;
    }
    if (customObjects.length > 0) {
      const firstId = customObjects[0].id ?? "0";
      return `custom-${firstId}`;
    }
    if (cabinEnabled) return "cabin";
    if (trussEnabled) return "truss";
    return null;
  }, [cabinEnabled, chairsDetailed, countersDetailed, customObjects, lampsDetailed, screensDetailed, trussEnabled]);
  useEffect(() => {
    const handleFrameShortcut = (event: KeyboardEvent) => {
      const key = normalizeEventKey(event);
      if (key !== "f") return;
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      const handled = frameSelection(validSelectedKey);
      if (!handled) {
        onFrameAll?.();
      }
    };
    window.addEventListener("keydown", handleFrameShortcut);
    return () => window.removeEventListener("keydown", handleFrameShortcut);
  }, [frameSelection, onFrameAll, validSelectedKey]);
  const clearSelectionState = useCallback(
    (removedKey?: string) => {
      setSelectedKey(null);
      closeContextMenu();
      clearInteractionSelection();
      setInteractionSelectionCenter(undefined);
      if (removedKey) {
        setCollidingKeys((prev) => {
          if (!prev.has(removedKey)) return prev;
          const next = new Set(prev);
          next.delete(removedKey);
          return next;
        });
      }
    },
    [clearInteractionSelection, closeContextMenu, setCollidingKeys, setInteractionSelectionCenter]
  );
  const deleteSelection = useCallback(
    (targetKey?: string | null) => {
      const key = targetKey ?? validSelectedKey ?? selectedKey;
      if (!key) return false;

    if (key === "cabin") {
      setConfig({
        modules: {
          storageRoom: false,
          cabin: { ...(cabin ?? {}), enabled: false },
        },
      });
      clearSelectionState(key);
      return true;
    }

    if (key === "truss") {
      setConfig({
        modules: {
          truss: false,
          trussLights: 0,
          trussLightsFront: 0,
          trussLightsBack: 0,
          trussLightsLeft: 0,
          trussLightsRight: 0,
          trussLightsDetailed: [],
          trussBannersFront: 0,
          trussBannersBack: 0,
          trussBannersLeft: 0,
          trussBannersRight: 0,
          trussBannerMipmaps: [],
          trussBannerKtx2Url: undefined,
          trussBannerWebpUrl: undefined,
          trussBannerImageUrl: undefined,
        },
      });
      clearSelectionState(key);
      return true;
    }

    if (key.startsWith("ctr-d-")) {
      const id = key.replace("ctr-d-", "");
      const next = countersDetailed.filter((ctr) => ctr.id !== id);
      if (next.length === countersDetailed.length) return false;
      setConfig({ modules: { countersDetailed: next } });
      clearSelectionState(key);
      return true;
    }

    if (key.startsWith("scr-d-")) {
      const id = key.replace("scr-d-", "");
      const next = screensDetailed.filter((scr) => scr.id !== id);
      if (next.length === screensDetailed.length) return false;
      setConfig({ modules: { detailedScreens: next } });
      clearSelectionState(key);
      return true;
    }

    if (key.startsWith("seat-")) {
      const id = key.replace("seat-", "");
      const next = chairsDetailed.filter((seat, idx) => (seat.id ?? `${idx}`) !== id);
      if (next.length === chairsDetailed.length) return false;
      setConfig({ modules: { chairsDetailed: next } });
      clearSelectionState(key);
      return true;
    }

    if (key.startsWith("custom-")) {
      const id = key.replace("custom-", "");
      const next = customObjects.filter((obj, idx) => (obj.id ?? `${idx}`) !== id);
      if (next.length === customObjects.length) return false;
      setConfig({ modules: { customObjects: next } });
      clearSelectionState(key);
      return true;
    }

    if (key.startsWith("legacy-counter-")) {
      const nextCount = Math.max(0, (counters ?? 0) - 1);
      if (nextCount === counters) return false;
      setConfig({ modules: { counters: nextCount } });
      clearSelectionState(key);
      return true;
    }

    return false;
  },
    [
      cabin,
      chairsDetailed,
      clearSelectionState,
      counters,
      countersDetailed,
      customObjects,
      screensDetailed,
      selectedKey,
      validSelectedKey,
      setConfig,
    ]
  );
  useEffect(() => {
    const onDeleteKey = (event: KeyboardEvent) => {
      const key = event.key;
      if (key !== "Delete" && key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      const typingTarget =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typingTarget) return;
      const removed = deleteSelection();
      if (removed) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onDeleteKey);
    return () => window.removeEventListener("keydown", onDeleteKey);
  }, [deleteSelection]);
  useEffect(() => {
    const onAlignKey = (event: KeyboardEvent) => {
      const key = normalizeEventKey(event);
      if (!key) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (key === "l") {
        alignSelection("x");
      } else if (key === "k") {
        alignSelection("z");
      } else if (key === "b") {
        alignSelection("back");
      }
    };
    window.addEventListener("keydown", onAlignKey);
    return () => window.removeEventListener("keydown", onAlignKey);
  }, [alignSelection]);
  useEffect(() => {
    registerSceneCommandAdapter({
      deleteSelection: (ctx) => (deleteSelection(ctx.selectionIds?.[0]) ? { status: "ok" } : { status: "noop" }),
      duplicateSelection: (ctx) =>
        duplicateSelectionByKey(ctx.selectionIds?.[0] ?? validSelectedKey) ? { status: "ok" } : { status: "noop" },
      changeMaterial: () => ({ status: "noop", message: "not_implemented" }),
      changeScreenVideo: () => ({ status: "noop", message: "not_implemented" }),
      resetTransform: (ctx) =>
        resetTransformByKey(ctx.selectionIds?.[0] ?? validSelectedKey) ? { status: "ok" } : { status: "noop" },
      snapToGrid: (ctx) =>
        snapSelectionByKey(ctx.selectionIds?.[0] ?? validSelectedKey) ? { status: "ok" } : { status: "noop" },
      alignToGrid: (ctx) =>
        snapSelectionByKey(ctx.selectionIds?.[0] ?? validSelectedKey) ? { status: "ok" } : { status: "noop" },
      alignLineX: () => (alignSelection("x") ? { status: "ok" } : { status: "noop" }),
      alignLineZ: () => (alignSelection("z") ? { status: "ok" } : { status: "noop" }),
      alignToBackWall: () => (alignSelection("back") ? { status: "ok" } : { status: "noop" }),
      selectAll: () => {
        if (!firstSelectableKey) return { status: "noop" };
        setSelectedKey(firstSelectableKey);
        setInteractionSelection([firstSelectableKey], { selectionType: selectionTypeFromKey(firstSelectableKey) });
        const center = selectionCenterOf(firstSelectableKey);
        if (center) setInteractionSelectionCenter(center);
        return { status: "ok" };
      },
      clearSelection: () => {
        setSelectedKey(null);
        clearInteractionSelection();
        setInteractionSelectionCenter(undefined);
        return { status: "ok" };
      },
      centerCamera: (ctx) => {
        const key = ctx.selectionIds?.[0] ?? validSelectedKey ?? firstSelectableKey;
        const center = ctx.selectionCenter ?? selectionCenterOf(key ?? undefined);
        if (center) {
          queueCameraAction({
            type: "flyTo",
            pose: { target: center, position: [center[0] + 2, center[1] + 1, center[2] + 2] },
            duration: 0.6,
            reason: "contextMenu",
          });
          return { status: "ok" };
        }
        const framed = frameSelection(key ?? null);
        return framed ? { status: "ok" } : { status: "noop" };
      },
    });
  }, [
    clearInteractionSelection,
    deleteSelection,
    duplicateSelectionByKey,
    firstSelectableKey,
    frameSelection,
    queueCameraAction,
    resetTransformByKey,
    alignSelection,
    selectionCenterOf,
    setInteractionSelection,
    setInteractionSelectionCenter,
    setSelectedKey,
    snapSelectionByKey,
    validSelectedKey,
  ]);
  useEffect(() => {
    if (selectionIds.length > 1) return;
    if (validSelectedKey) {
      if (selectionIds.length === 1 && selectionIds[0] === validSelectedKey) return;
      setInteractionSelection([validSelectedKey], { selectionType: selectionTypeFromKey(validSelectedKey) });
      return;
    }
    if (selectionIds.length === 0) return;
    clearInteractionSelection();
  }, [clearInteractionSelection, selectionIds, setInteractionSelection, validSelectedKey]);
  useEffect(() => {
    if (validSelectedKey) {
      const center = selectionCenterOf(validSelectedKey);
      if (center) {
        setInteractionSelectionCenter(center);
        return;
      }
    }
    setInteractionSelectionCenter(undefined);
  }, [selectionCenterOf, setInteractionSelectionCenter, validSelectedKey]);
  // ---- Render
  return (
    <group
      position={[0, 0, 0]}
      // Klick ins Leere / auf Grundfl+ñche: Selektion aufheben
      onPointerMissed={() => { setSelectedKey(null); clearInteractionSelection(); setInteractionSelectionCenter(undefined); }}
    >
      {/* Kurze HUD-Hilfe im EditÔÇæModus */}
      {editMode && (
        <Html position={[0, Math.max(2.2, height + 0.5), 0]} center>
          <div style={{
            padding: "6px 10px",
            fontSize: 12,
            color: "#e5e7eb",
            background: "rgba(2,6,23,.6)",
            border: "1px solid rgba(148,163,184,.35)",
            borderRadius: 6,
            pointerEvents: "none",
            whiteSpace: "nowrap"
          }}>
            <strong>Edit</strong> (E) | Mode: <strong>{transformMode}</strong> (T/R/S) | Snap: <strong>{snapOn ? snapStep.toFixed(2) + " m" : "aus"}</strong> (G) | Multi: Strg/Shift-Klick | Ausrichten: L/X, K/Z, B/Rueckwand | ESC: Deselektieren
          </div>
        </Html>
      )}
      {editMode && sceneAabbs.length > 0 && (
        <group>
          {sceneAabbs.map((box) => {
            const hot = collisionHotIds.has(box.id);
            const color = hot ? "#ef4444" : "#0ea5e9";
            const fill = hot ? "#fecdd3" : "#e0f2fe";
            const parts = box.colliders?.length ? box.colliders : [box];
            return parts.map((part) => {
              const innerW = Math.max(0.05, part.halfWidth * 2 - part.clearance * 2);
              const innerD = Math.max(0.05, part.halfDepth * 2 - part.clearance * 2);
              return (
                <group
                  key={`zone-${box.id}-${part.id}`}
                  position={[part.centerX, floorHeight + 0.001, part.centerZ]}
                  rotation-y={part.rotationY}
                >
                  <mesh rotation-x={-Math.PI / 2}>
                    <planeGeometry args={[part.halfWidth * 2, part.halfDepth * 2]} />
                    <meshBasicMaterial transparent opacity={0.12} color={fill} depthWrite={false} />
                  </mesh>
                  <mesh position={[0, 0.0005, 0]}>
                    <boxGeometry args={[part.halfWidth * 2, 0.001, part.halfDepth * 2]} />
                    <meshBasicMaterial wireframe color={color} opacity={0.85} transparent depthWrite={false} />
                  </mesh>
                  {part.clearance > 0.001 && (
                    <mesh position={[0, 0.0008, 0]} rotation-x={-Math.PI / 2}>
                      <planeGeometry args={[innerW, innerD]} />
                      <meshBasicMaterial
                        transparent
                        opacity={0.12}
                        color={hot ? "#fecdd3" : "#bbf7d0"}
                        depthWrite={false}
                      />
                    </mesh>
                  )}
                </group>
              );
            });
          })}
        </group>
      )}
      {placementHint &&
        (() => {
          const lineColor = placementHint.colliding ? "#ef4444" : "#0ea5e9";
          const areaColor = placementHint.colliding ? "#fecdd3" : "#a7f3d0";
          const footprintColor = placementHint.colliding ? "#f87171" : "#22c55e";
          const xLeft = placementHint.pos.x - placementHint.halfW;
          const xRight = placementHint.pos.x + placementHint.halfW;
          const zBack = placementHint.pos.z - placementHint.halfD;
          const zFront = placementHint.pos.z + placementHint.halfD;
          const leftLength = Math.abs(xLeft - placementHint.bounds.left);
          const rightLength = Math.abs(placementHint.bounds.right - xRight);
          const backLength = Math.abs(zBack - placementHint.bounds.back);
          const frontLength = Math.abs(placementHint.bounds.front - zFront);
          const safe = (val: number) => Math.max(0, val).toFixed(2);
          return (
            <group>
              <mesh
                position={[placementHint.pos.x, floorHeight + 0.002, placementHint.pos.z]}
                rotation-x={-Math.PI / 2}
                rotation-y={placementHint.rotation ?? 0}
              >
                <planeGeometry args={[placementHint.halfW * 2, placementHint.halfD * 2]} />
                <meshBasicMaterial color={areaColor} transparent opacity={0.2} />
              </mesh>
              <mesh
                position={[placementHint.pos.x, floorHeight + 0.003, placementHint.pos.z]}
                rotation-x={-Math.PI / 2}
                rotation-y={placementHint.rotation ?? 0}
              >
                <planeGeometry args={[placementHint.size.w, placementHint.size.d]} />
                <meshBasicMaterial color={footprintColor} transparent opacity={0.14} />
              </mesh>
              <mesh
                position={[((placementHint.bounds.left + xLeft) / 2), floorHeight + 0.004, placementHint.pos.z]}
                rotation-x={-Math.PI / 2}
              >
                <planeGeometry args={[Math.max(0.02, leftLength), 0.05]} />
                <meshBasicMaterial color={lineColor} transparent opacity={0.4} />
              </mesh>
              <mesh
                position={[((placementHint.bounds.right + xRight) / 2), floorHeight + 0.004, placementHint.pos.z]}
                rotation-x={-Math.PI / 2}
              >
                <planeGeometry args={[Math.max(0.02, rightLength), 0.05]} />
                <meshBasicMaterial color={lineColor} transparent opacity={0.4} />
              </mesh>
              <mesh
                position={[placementHint.pos.x, floorHeight + 0.004, ((placementHint.bounds.back + zBack) / 2)]}
                rotation-x={-Math.PI / 2}
              >
                <planeGeometry args={[0.05, Math.max(0.02, backLength)]} />
                <meshBasicMaterial color={lineColor} transparent opacity={0.4} />
              </mesh>
              <mesh
                position={[placementHint.pos.x, floorHeight + 0.004, ((placementHint.bounds.front + zFront) / 2)]}
                rotation-x={-Math.PI / 2}
              >
                <planeGeometry args={[0.05, Math.max(0.02, frontLength)]} />
                <meshBasicMaterial color={lineColor} transparent opacity={0.4} />
              </mesh>
              <Html position={[placementHint.pos.x, floorHeight + 0.08, placementHint.pos.z]} center>
                <div
                  style={{
                    background: placementHint.colliding ? "#7f1d1d" : "#0f172a",
                    color: "#f8fafc",
                    padding: "4px 8px",
                    borderRadius: 6,
                    fontSize: 11,
                    boxShadow: "0 8px 16px rgba(0,0,0,0.35)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Abstand L {safe(placementHint.distances.left)} m · R {safe(placementHint.distances.right)} m · F{" "}
                  {safe(placementHint.distances.front)} m · B {safe(placementHint.distances.back)} m
                </div>
              </Html>
            </group>
          );
        })()}
      {draggedKey && snapMarkers.length > 0 && (
        <group>
          {snapMarkers.map((pt, idx) => (
            <mesh key={`snap-marker-${idx}`} position={[pt.x, 0.02, pt.z]}>
              <cylinderGeometry args={[0.04, 0.04, 0.012, 14]} />
              <meshStandardMaterial
                color={pt.type === "truss" ? "#22d3ee" : "#f97316"}
                emissive={pt.type === "truss" ? "#22d3ee" : "#f97316"}
                emissiveIntensity={0.7}
                transparent
                opacity={0.9}
                depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      )}
      {editMode && (selectionIds.length > 0 || selectedKey) && (
        <BoundingBoxOverlay
          boxes={sceneAabbs}
          selectionIds={selectionIds.length > 0 ? selectionIds : selectedKey ? [selectedKey] : []}
          collidingKeys={collidingKeys}
          editMode={editMode}
        />
      )}
      {/* Basisplatte (Rand, damit Schatten bleibt) */}
      <RigidBody
        type="fixed"
        colliders={false}
        restitution={0.05}
        friction={1.1}
        userData={{ kind: "floor" }}
      >
        <CuboidCollider
          args={[scaleX / 2, Math.max(0.01, floorHeight / 2), scaleZ / 2]}
          position={[0, Math.max(0.01, floorHeight / 2), 0]}
        />
        <mesh
          position={[0, 0.0, 0]}
          rotation-x={-Math.PI / 2}
          receiveShadow
          castShadow={false}
          onClick={() => setSelectedKey(null)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setSelectedKey(null);
            onFrameAll?.();
          }}
          onContextMenu={handleGroundContextMenu}
        >
          <planeGeometry args={[scaleX + 0.4, scaleZ + 0.4]} />
          <meshStandardMaterial
            {...pbr({ color: "#0b1220", metalness: 0.2, roughness: 0.82, opacity: 0.94, transparent: true })}
          />
        </mesh>
        {/* Doppelboden-Körper */}
        {isRaised && (
          <mesh position={[0, floorHeight / 2, 0]} receiveShadow castShadow>
            <boxGeometry args={[scaleX, floorHeight, scaleZ]} />
            <meshStandardMaterial {...pbr({ color: "#0b1220", roughness: 0.6, metalness: 0.22 })} />
          </mesh>
        )}
        {/* Bodenfläche */}
        <mesh position={[0, floorHeight + 0.001, 0]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[scaleX, scaleZ]} />
          <meshStandardMaterial
            color={floorMaterial.color}
            roughness={floorMaterial.roughness}
            metalness={floorMaterial.metalness}
            map={floorTextureUrl ? floorTexture : undefined}
          />
        </mesh>
      </RigidBody>
      {/* Wände */}
      {wallsClosedSides >= 1 && (
        <RigidBody
          type="fixed"
          colliders={false}
          restitution={0.02}
          friction={0.95}
          userData={{ kind: "wall", side: "back" }}
          position={[0, wallCenterY, -depth / 2 + wallThickness / 2]}
        >
          <CuboidCollider args={[width / 2, wallHeight / 2, wallThickness / 2]} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[width, wallHeight, wallThickness]} />
            <meshStandardMaterial
              {...wallMaterialProps(surfaceOf("back"))}
              map={wallBackTextureUrl ? wallBackTexture : undefined}
            />
          </mesh>
        </RigidBody>
      )}
      {wallsClosedSides >= 2 && (
        <RigidBody
          type="fixed"
          colliders={false}
          restitution={0.02}
          friction={0.95}
          userData={{ kind: "wall", side: "left" }}
          position={[-width / 2 + wallThickness / 2, wallCenterY, 0]}
        >
          <CuboidCollider args={[wallThickness / 2, wallHeight / 2, depth / 2]} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[wallThickness, wallHeight, depth]} />
            <meshStandardMaterial
              {...wallMaterialProps(surfaceOf("left"))}
              map={wallLeftTextureUrl ? wallLeftTexture : undefined}
            />
          </mesh>
        </RigidBody>
      )}
      {wallsClosedSides >= 3 && (
        <RigidBody
          type="fixed"
          colliders={false}
          restitution={0.02}
          friction={0.95}
          userData={{ kind: "wall", side: "right" }}
          position={[width / 2 - wallThickness / 2, wallCenterY, 0]}
        >
          <CuboidCollider args={[wallThickness / 2, wallHeight / 2, depth / 2]} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[wallThickness, wallHeight, depth]} />
            <meshStandardMaterial
              {...wallMaterialProps(surfaceOf("right"))}
              map={wallRightTextureUrl ? wallRightTexture : undefined}
            />
          </mesh>
        </RigidBody>
      )}
      {/* Lagerraum / Kabine (Drag-fähig im Edit-Modus) */}
      {cabinEnabled && cabin && (() => {
        const cabinBox = registerBounds(
          "cabin",
          new THREE.Box3(
            new THREE.Vector3(cabinPosX - cabinWidth / 2, floorHeight, cabinPosZ - cabinDepth / 2),
            new THREE.Vector3(cabinPosX + cabinWidth / 2, floorHeight + cabinHeight, cabinPosZ + cabinDepth / 2)
          )
        );
        const cabinClearance = clearanceFor("cabin", cabin.clearance);
        const cabinRotation = cabin.rotationY ?? 0;
        return (
          <Transformable
            enabled={editMode && (isSelected("cabin") || draggedKey === "cabin")}
            mode={transformMode}
            snap={snapOn}
            snapStep={snapStep}
            physics={{
              enabled: editMode && (isSelected("cabin") || draggedKey === "cabin"),
              type: "dynamic",
              colliders: false,
              childrenColliders: <CuboidCollider args={[cabinWidth / 2, cabinHeight / 2, cabinDepth / 2]} />,
              mass: 35,
              restitution: 0.08,
              friction: 1.05,
              linearDamping: 4.6,
              angularDamping: 7.2,
              gravityScale: 1,
              enabledTranslations: [true, false, true],
              enabledRotations: [false, true, false],
              impactRadius: Math.max(cabinWidth, cabinDepth) * 0.65,
              onCollisionChange: (collided) => setCollisionState("cabin", collided),
            }}
            onDragStart={() =>
              startDrag("cabin", { w: cabinWidth, d: cabinDepth, clearance: cabinClearance, rotation: cabinRotation })
            }
            onDragEnd={endDrag}
            onChange={(pos) => {
              const c = clampXZ(pos.x, pos.z, width, depth, cabinWidth / 2, cabinDepth / 2);
              const { position: resolved } = resolvePredictiveMove(
                "cabin",
                c,
                (p) =>
                  [
                    makeObb(
                      "cabin",
                      "Kabine",
                      p.x,
                      p.z,
                      cabinWidth,
                      cabinDepth,
                      cabinClearance,
                      cabinRotation
                    ),
                  ],
                { fallback: { x: cabinPosX, z: cabinPosZ } }
              );
              const basePos = groupDragSnapshot.current["cabin"] ?? { x: cabinPosX, z: cabinPosZ };
              const delta = { x: resolved.x - basePos.x, z: resolved.z - basePos.z };
              const safeDelta = resolveGroupDelta("cabin", delta);
              const next = new THREE.Vector3(basePos.x + safeDelta.x, pos.y, basePos.z + safeDelta.z);
              pos.copy(next);
              setConfig({
                modules: {
                  cabin: {
                    enabled: cabinEnabled,
                    width: cabinWidth,
                    depth: cabinDepth,
                    height: cabinHeight,
                    position: { x: next.x, z: next.z },
                  },
                },
              });
              if (Math.hypot(safeDelta.x, safeDelta.z) > 1e-4) applyGroupDelta("cabin", safeDelta);
              setCollisionState("cabin", Math.hypot(safeDelta.x - delta.x, safeDelta.z - delta.z) > 1e-4);
              return next;
            }}
          >
            <group
              position={[cabinPosX, cabinCenterY, cabinPosZ]}
              onClick={(e: ThreeEvent<MouseEvent>) => handleSelectKey(e, "cabin", "cabin")}
              onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                setSelectedKey("cabin");
                void frameBox(cabinBox);
              }}
              onContextMenu={(e: ThreeEvent<MouseEvent>) => openContextMenuForSelection(e, "cabin", "cabin")}
            >
              {(() => {
                const cabinWallThickness = 0.05;
                const wallMaterial = {
                  preset: "hpl" as const,
                  color: "#d1d5db",
                  roughness: 0.9,
                  metalness: 0.05,
                };
                const doorHeight = Math.min(2.1, cabinHeight - 0.2);
                const doorWidth =
                  doorSide === "left" || doorSide === "right"
                    ? Math.min(0.9, cabinDepth - 0.2)
                    : Math.min(0.9, cabinWidth - 0.2);
                return (
                  <Cabin
                    width={cabinWidth}
                    depth={cabinDepth}
                    height={cabinHeight}
                    position={[0, 0, 0]}
                    floorHeight={floorHeight}
                    wallThickness={cabinWallThickness}
                    wallMaterial={wallMaterial}
                    doorPosition={doorSide}
                    doorHeight={doorHeight}
                    doorWidth={doorWidth}
                    doorOpen={!editMode}
                  />
                );
              })()}
            {/* Auswahl-Rahmen */}
            {isSelected("cabin") && (
              <mesh>
                <boxGeometry args={[cabinWidth, cabinHeight, cabinDepth]} />
                <meshBasicMaterial wireframe color="#22d3ee" />
              </mesh>
            )}
            {collidingKeys.has("cabin") && (
              <>
                <mesh>
                  <boxGeometry
                    args={[
                      cabinWidth + cabinClearance * 2,
                      cabinHeight,
                      cabinDepth + cabinClearance * 2,
                    ]}
                  />
                  <meshBasicMaterial wireframe color="#ef4444" />
                </mesh>
                <Html center position={[0, cabinHeight / 2 + 0.05, 0]}>
                  <div
                    style={{
                      background: "#991b1b",
                      color: "white",
                      padding: "4px 8px",
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                    }}
                  >
                    Belegt ÔÇô bitte verschieben
                  </div>
                </Html>
              </>
            )}
          </group>
        </Transformable>
      );
    })()}
      {/* Counters ÔÇô Detailed bevorzugt, sonst Legacy */}
      {countersDetailed.length > 0
        ? countersDetailed.map((ctr) => {
            const geom = resolveCounterGeometry(ctr);
            const { variant, w, d, h, colliders } = geom;
            const px = ctr.position?.x ?? 0;
            const pz = ctr.position?.z ?? 0;
            const key = `ctr-d-${ctr.id}`;
            const selected = isSelected(key);
            const counterClearance = clearanceFor("counter", ctr.clearance);
            const counterRotation = ctr.rotationY ?? 0;
            const footprint = buildCounterFootprint(ctr, { x: px, z: pz }, counterClearance, counterRotation);
            const footprintW = footprint.halfW * 2;
            const footprintD = footprint.halfD * 2;
            const counterBox = registerBounds(
              key,
              new THREE.Box3(
                new THREE.Vector3(px - footprint.halfW, floorHeight, pz - footprint.halfD),
                new THREE.Vector3(px + footprint.halfW, floorHeight + h, pz + footprint.halfD)
              )
            );
            return (
              <Transformable
                key={key}
                enabled={editMode && (selected || draggedKey === key)}
                mode={transformMode}
                snap={snapOn}
                snapStep={snapStep}

                physics={{
                  enabled: editMode && (selected || draggedKey === key),
                  type: "dynamic",
                  colliders: false,
                  childrenColliders: colliders.length ? (
                    <>
                      {colliders.map((col, idx) => (
                        <CuboidCollider
                          // eslint-disable-next-line react/no-array-index-key
                          key={`${key}-col-${idx}`}
                          args={[Math.max(col.width / 2, 0.01), h / 2, Math.max(col.depth / 2, 0.01)]}
                          position={[col.x ?? 0, h / 2, col.z ?? 0]}
                        />
                      ))}
                    </>
                  ) : (
                    <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
                  ),
                  mass: Math.max(8, footprintW * footprintD * 4),
                  restitution: 0.12,
                  friction: 0.95,
                  linearDamping: 4.2,
                  angularDamping: 7,
                  gravityScale: 1,
                  enabledTranslations: [true, false, true],
                  enabledRotations: [false, true, false],
                  impactRadius: Math.max(footprint.halfW, footprint.halfD) * 1.1,
                  onCollisionChange: (state) => setCollisionState(key, state),
                }}

                onDragStart={() =>
                  startDrag(key, {
                    w,
                    d,
                    clearance: counterClearance,
                    rotation: counterRotation,
                    colliders,
                  })
                }
                onDragEnd={endDrag}
                onChange={(pos) => {
                  const clamped = clampXZ(pos.x, pos.z, width, depth, footprint.halfW, footprint.halfD);
                  const { position: resolved } = resolvePredictiveMove(
                    key,
                    clamped,
                (p) =>
                  [
                    makeObb(
                      key,
                      "Counter",
                          p.x,
                          p.z,
                          w,
                          d,
                          counterClearance,
                          counterRotation,
                          colliders
                    ),
                  ],
                { fallback: { x: px, z: pz } }
              );
              const basePos = groupDragSnapshot.current[key] ?? { x: px, z: pz };
              const delta = { x: resolved.x - basePos.x, z: resolved.z - basePos.z };
              const safeDelta = resolveGroupDelta(key, delta);
              const nextPos = new THREE.Vector3(basePos.x + safeDelta.x, floorHeight, basePos.z + safeDelta.z);
              pos.copy(nextPos);
              const nextCounters = countersDetailed.map((c0) =>
                c0.id === ctr.id ? { ...c0, position: { ...c0.position, x: nextPos.x, z: nextPos.z } } : c0
              );
              setConfig({ modules: { countersDetailed: nextCounters } });
              if (Math.hypot(safeDelta.x, safeDelta.z) > 1e-4) applyGroupDelta(key, safeDelta);
              setCollisionState(key, Math.hypot(safeDelta.x - delta.x, safeDelta.z - delta.z) > 1e-4);
              return nextPos;
            }}
            >
                  <group
                    position={[px, floorHeight, pz]}
                    rotation-y={counterRotation}
                  onClick={(e) => handleSelectKey(e, key, "counter")}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(key);
                    void frameBox(counterBox);
                  }}
                  onContextMenu={(e) => openContextMenuForSelection(e, key, "counter")}
                >
                  <group position={[0, h / 2, 0]}>
                    <CounterBlock
                      variant={variant}
                      w={w}
                      d={d}
                      h={h}
                      materialize={pbr}
                      envMapIntensity={envMapIntensity}
                    />
                  </group>
                  {(ctr.withPower ?? countersWithPower) && (
                    <mesh position={[w / 2 - 0.1, 0.1, d / 2 - 0.1]} castShadow={false}>
                      <boxGeometry args={[0.08, 0.08, 0.08]} />
                      <meshStandardMaterial
                        {...pbr({
                          color: "#fbbf24",
                          emissive: "#f59e0b",
                          emissiveIntensity: 1.2,
                          roughness: 0.35,
                        })}
                      />
                    </mesh>
                  )}
                  {selected && (
                    <mesh>
                      <boxGeometry args={[footprintW, h, footprintD]} />
                      <meshBasicMaterial wireframe color="#10b981" />
                    </mesh>
                  )}
                  {collidingKeys.has(key) && (
                    <>
                      <mesh>
                        <boxGeometry args={[footprintW, h + 0.05, footprintD]} />
                        <meshBasicMaterial wireframe color="#ef4444" />
                      </mesh>
                      <Html center position={[0, h + 0.1, 0]}>
                        <div
                          style={{
                            background: "#991b1b",
                            color: "white",
                            padding: "4px 8px",
                            borderRadius: 8,
                            fontSize: 12,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                          }}
                        >
                          Kollision erkannt
                        </div>
                      </Html>
                    </>
                  )}
                </group>
              </Transformable>
            );
          })
        : // Legacy: statisch ÔÇô Doppelklick => Detailed
          Array.from({ length: counters ?? 0 }).map((_, idx) => {
            const spacing = width / ((counters ?? 0) + 1 || 1);
            const xPos = -width / 2 + spacing * (idx + 1);
            const zPos = countersPlacement === "center" ? 0 : depth / 2 - 0.5;
            const variant = modules.counterVariant ?? "basic";
            const w = variant === "premium" ? 1.4 : 0.9;
            const d = variant === "premium" ? 0.6 : 0.5;
            const h = 1.1;
            const k = `legacy-counter-${idx}`;
            const legacyBox = registerBounds(
              k,
              new THREE.Box3(
                new THREE.Vector3(xPos - w / 2, floorHeight, zPos - d / 2),
                new THREE.Vector3(xPos + w / 2, floorHeight + h, zPos + d / 2)
              )
            );
            return (
              <group
                key={k}
                position={[xPos, floorHeight, zPos]}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(k);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(k);
                  void frameBox(legacyBox);
                }}
              >
                <group position={[0, 0.55, 0]}>
                  <CounterBlock
                    variant={variant}
                    envMapIntensity={envMapIntensity}
                    materialize={pbr}
                  />
                </group>
                {countersWithPower && (
                  <mesh position={[0.45, 0.1, 0.25]} castShadow={false}>
                    <boxGeometry args={[0.08, 0.08, 0.08]} />
                    <meshStandardMaterial
                      {...pbr({
                        color: "#fbbf24",
                        emissive: "#f59e0b",
                        emissiveIntensity: 1.2,
                        roughness: 0.35,
                      })}
                    />
                  </mesh>
                )}
              </group>
            );
          })}
      {/* Seating */}
      {chairsDetailed.length > 0 &&
        chairsDetailed.map((seat, idx) => {
          const type = seat.type ?? "chair";
          const dims = resolveSeatingGeometry(type, seat.footprint, seat.seatHeight, seat.backHeight);
          const px = seat.position?.x ?? 0;
          const pz = seat.position?.z ?? 0;
          const rotY = seat.rotationY ?? 0;
          const seatClearance = clearanceFor("chair", seat.clearance);
          const seatId = seat.id ?? `${idx}`;
          const key = `seat-${seatId}`;
          const selected = isSelected(key);
          const overlayHeight = Math.max(0.6, dims.backHeight ?? dims.seatHeight + 0.3);
          const seatBox = registerBounds(
            key,
            new THREE.Box3(
              new THREE.Vector3(px - dims.w / 2, floorHeight, pz - dims.d / 2),
              new THREE.Vector3(px + dims.w / 2, floorHeight + overlayHeight, pz + dims.d / 2)
            )
          );
          return (
              <Transformable
              key={key}
              enabled={editMode && (selected || draggedKey === key)}
              mode={transformMode}
              snap={snapOn}
              snapStep={snapStep}
              physics={{
                enabled: editMode && (selected || draggedKey === key),
                type: "dynamic",
                colliders: "hull",
                mass: Math.max(1.5, dims.w * dims.d * 4),
                restitution: 0.18,
                friction: 0.9,
                linearDamping: 3.2,
                angularDamping: 5,
                gravityScale: 1,
                enabledTranslations: [true, false, true],
                enabledRotations: [false, true, false],
                impactRadius: Math.max(dims.w, dims.d) * 0.55,
                onCollisionChange: (state) => setCollisionState(key, state),
              }}
              onDragStart={() => startDrag(key, { w: dims.w, d: dims.d, clearance: seatClearance, rotation: rotY })}
              onDragEnd={endDrag}
              onChange={(pos) => {
                const clamped = clampXZ(pos.x, pos.z, width, depth, dims.w / 2, dims.d / 2);
                const { position: resolved } = resolvePredictiveMove(
                  key,
                  clamped,
                  (p) => [makeObb(key, "Sitzmoebel", p.x, p.z, dims.w, dims.d, seatClearance, rotY)],
                  { fallback: { x: px, z: pz } }
                );
                const nextPos = new THREE.Vector3(resolved.x, floorHeight, resolved.z);
                pos.copy(nextPos);
                const next = chairsDetailed.map((c0, cIdx) => {
                  const currentId = c0.id ?? `${cIdx}`;
                  if (currentId !== seatId) return c0;
                  return { ...c0, position: { ...c0.position, x: resolved.x, z: resolved.z } };
                });
                setConfig({ modules: { chairsDetailed: next } });
                const base = groupDragSnapshot.current[key] ?? { x: px, z: pz };
                const delta = { x: resolved.x - base.x, z: resolved.z - base.z };
                if (Math.hypot(delta.x, delta.z) > 1e-4) applyGroupDelta(key, delta);
                return nextPos;
              }}
            >
                <group
                  position={[px, floorHeight, pz]}
                  rotation-y={rotY}
                onClick={(e) => handleSelectKey(e, key, "chair")}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(key);
                  void frameBox(seatBox);
                }}
                onContextMenu={(e) => openContextMenuForSelection(e, key, "chair")}
              >
                <SeatMesh seat={seat} materialize={pbr} />
                {selected && (
                  <mesh>
                    <boxGeometry args={[dims.w, overlayHeight, dims.d]} />
                    <meshBasicMaterial wireframe color="#10b981" />
                  </mesh>
                )}
                {collidingKeys.has(key) && (
                  <>
                    <mesh>
                      <boxGeometry
                        args={[dims.w + seatClearance * 2, overlayHeight, dims.d + seatClearance * 2]}
                      />
                      <meshBasicMaterial wireframe color="#ef4444" />
                    </mesh>
                    <Html center position={[0, overlayHeight / 2 + 0.05, 0]}>
                      <div
                        style={{
                          background: "#991b1b",
                          color: "white",
                          padding: "4px 8px",
                          borderRadius: 8,
                          fontSize: 12,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                        }}
                      >
                        Kollision erkannt
                      </div>
                    </Html>
                  </>
                )}
              </group>
            </Transformable>
          );
        })}
      {/* Custom 3D-Modelle */}
      {customObjects.length > 0 &&
        customObjects.map((obj, idx) => {
          const w = Math.max(0.05, obj.footprint?.w ?? 1);
          const d = Math.max(0.05, obj.footprint?.d ?? 1);
          const h = Math.max(0.2, obj.footprint?.h ?? 1);
          const px = obj.position?.x ?? 0;
          const pz = obj.position?.z ?? 0;
          const rot = obj.rotationY ?? 0;
          const key = `custom-${obj.id ?? idx}`;
          const selected = isSelected(key);
          const customClearance = clearanceFor("custom", obj.clearance);
          const bounds = registerBounds(
            key,
            new THREE.Box3(
              new THREE.Vector3(px - w / 2, floorHeight, pz - d / 2),
              new THREE.Vector3(px + w / 2, floorHeight + h, pz + d / 2)
            )
          );
          const mass = Math.max(2, obj.weight ?? w * d * 3);
          return (
            <Transformable
              key={key}
              enabled={editMode && (selected || draggedKey === key)}
              mode={transformMode}
              snap={snapOn}
              snapStep={snapStep}
              physics={{
                enabled: editMode && (selected || draggedKey === key),
                type: "dynamic",
                colliders: false,
                childrenColliders: (
                  <CuboidCollider
                    args={[Math.max(w / 2, 0.05), h / 2, Math.max(d / 2, 0.05)]}
                    position={[0, h / 2, 0]}
                  />
                ),
                mass,
                restitution: 0.1,
                friction: 0.9,
                linearDamping: 3,
                angularDamping: 5,
                gravityScale: 1,
                enabledTranslations: [true, false, true],
                enabledRotations: [false, true, false],
                impactRadius: Math.max(w, d) * 0.6,
                onCollisionChange: (state) => setCollisionState(key, state),
              }}
              onDragStart={() => startDrag(key, { w, d, clearance: customClearance, rotation: rot })}
              onDragEnd={endDrag}
              onChange={(pos) => {
                const clamped = clampXZ(pos.x, pos.z, width, depth, w / 2, d / 2);
                const { position: resolved } = resolvePredictiveMove(
                  key,
                  clamped,
                  (p) => [makeObb(key, obj.name ?? "Custom 3D", p.x, p.z, w, d, customClearance, rot)],
                  { fallback: { x: px, z: pz } }
                );
                const nextPos = new THREE.Vector3(resolved.x, floorHeight, resolved.z);
                pos.copy(nextPos);
                const next = customObjects.map((o, cIdx) => {
                  const currentId = o.id ?? `${cIdx}`;
                  if (`custom-${currentId}` !== key) return o;
                  return { ...o, position: { ...o.position, x: resolved.x, z: resolved.z } };
                });
                setConfig({ modules: { customObjects: next } });
                const base = groupDragSnapshot.current[key] ?? { x: px, z: pz };
                const delta = { x: resolved.x - base.x, z: resolved.z - base.z };
                if (Math.hypot(delta.x, delta.z) > 1e-4) applyGroupDelta(key, delta);
                return nextPos;
              }}
            >
              <group
                position={[px, floorHeight, pz]}
                rotation-y={rot}
                onClick={(e) => handleSelectKey(e, key, "custom")}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(key);
                  void frameBox(bounds);
                }}
                onContextMenu={(e) => openContextMenuForSelection(e, key, "custom")}
              >
                <Suspense
                  fallback={
                    <Html center>
                      <div className="sidebar-fallback" style={{ padding: "4px 10px" }}>
                        Lädt Modell...
                      </div>
                    </Html>
                  }
                >
                  <CustomModel url={obj.assetUrl} scale={obj.scale ?? 1} />
                </Suspense>
                {selected && (
                  <mesh>
                    <boxGeometry args={[w, h, d]} />
                    <meshBasicMaterial wireframe color="#10b981" />
                  </mesh>
                )}
                {collidingKeys.has(key) && (
                  <>
                    <mesh>
                      <boxGeometry args={[w + customClearance * 2, h, d + customClearance * 2]} />
                      <meshBasicMaterial wireframe color="#ef4444" />
                    </mesh>
                    <Html center position={[0, h / 2 + 0.05, 0]}>
                      <div
                        style={{
                          background: "#991b1b",
                          color: "white",
                          padding: "4px 8px",
                          borderRadius: 8,
                          fontSize: 12,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                        }}
                      >
                        Kollision erkannt
                      </div>
                    </Html>
                  </>
                )}
              </group>
            </Transformable>
          );
        })}
      {/* LED-Rahmen */}
      {(() => {
        const rawFrames =
          ledFramesDetailed && ledFramesDetailed.length
            ? ledFramesDetailed
            : Array.from({ length: ledFrames ?? 0 }).map((_, idx) => ({
                id: `legacy-led-${idx}`,
                count: 1,
                wallSide: ledWallSide,
              }));
        const expanded: {
          id?: string;
          wallSide?: WallSide;
          lastWallSide?: WallSide;
          position?: { x?: number; z?: number };
          height?: number;
          rotationY?: number;
          count?: number;
          renderKey?: string;
        }[] = [];
        rawFrames.forEach((frame, idx) => {
          const count = Math.max(1, Number(frame.count) || 1);
          for (let i = 0; i < count; i++) {
            const baseId = frame.id ?? `led-${idx}-${i}`;
            const renderKey = frame.id ? `${frame.id}-${idx}-${i}` : baseId;
            expanded.push({
              ...frame,
              id: baseId,
              renderKey,
            });
          }
        });
        const prepared = expanded
          .map((frame, idx) => {
            const resolvedId = frame.id ?? `led-${idx}`;
            const binding = attachmentById[resolvedId];
            const preferredWall = (binding?.wall ?? frame.wallSide ?? frame.lastWallSide ?? ledWallSide) as
              | WallSide
              | undefined;
            const hasWall = preferredWall ? allowedWallsSet.has(preferredWall) : false;
            const targetWall = hasWall ? preferredWall : neutralWall;
            const floating = Boolean(binding?.floating || !hasWall);
            if (!targetWall) return null;
            const renderKey = frame.renderKey ?? `${resolvedId}-${idx}`;
            return { ...frame, id: resolvedId, targetWall, floating, renderKey };
          })
          .filter(
            (frame): frame is NonNullable<typeof frame> & { targetWall: WallSide; floating: boolean } =>
              Boolean(frame?.targetWall)
          );
        const byWall: Record<WallSide, typeof prepared> = { back: [], left: [], right: [], front: [] };
        prepared.forEach((frame) => {
          byWall[frame.targetWall].push(frame);
        });
        const rendered: JSX.Element[] = [];
        (["back", "left", "right"] as WallSide[]).forEach((side) => {
          const list = byWall[side];
          const total = list.length;
          list.forEach((frame, idx) => {
            const frameHeight = frame.height ?? 2.2;
            const y = floorHeight + frameHeight / 2 + 0.4;
            let x = 0;
            let z = 0;
            let rotY = frame.rotationY ?? 0;
            if (side === "back") {
              const spacing = total > 0 ? width / (total + 1) : width;
              x = frame.position?.x ?? -width / 2 + spacing * (idx + 1);
              z = frame.position?.z ?? backWallFrontZ;
            } else if (side === "left") {
              const spacing = total > 0 ? depth / (total + 1) : depth;
              z = frame.position?.z ?? -depth / 2 + spacing * (idx + 1);
              x = frame.position?.x ?? leftWallInnerX;
              rotY = frame.rotationY ?? Math.PI / 2;
            } else {
              const spacing = total > 0 ? depth / (total + 1) : depth;
              z = frame.position?.z ?? -depth / 2 + spacing * (idx + 1);
              x = frame.position?.x ?? rightWallInnerX;
              rotY = frame.rotationY ?? -Math.PI / 2;
            }
            rendered.push(
              <WallAttachmentBox
                key={frame.renderKey ?? frame.id ?? `${side}-led-${idx}`}
                position={[x, y, z]}
                rotationY={rotY}
                height={frameHeight}
                floating={frame.floating}
                materialize={pbr}
                envMapIntensity={envMapIntensity}
              />
            );
          });
        });
        return rendered;
      })()}
      {/* Screens ÔÇô Detailed bevorzugt, sonst Legacy */}
      {screensDetailed.length > 0
        ? screensDetailed.map((scr) => {
            const w = scr.size?.w ?? 0.9;
            const h = scr.size?.h ?? 0.55;
            const t = scr.size?.t ?? 0.02;
            const mount = scr.mount ?? "wall";
            const y = (scr.heightFromFloor ?? (floorHeight + 1.6)) - floorHeight; // lokaler Offset
            const key = `scr-d-${scr.id}`;
            const selected = isSelected(key);
            const screenId = scr.id ?? key;
            const binding = attachmentById[screenId];
            const preferredWall = (binding?.wall ?? scr.wallSide ?? scr.lastWallSide ?? screensWallSide) as
              | WallSide
              | undefined;
            const hasWall = preferredWall ? allowedWallsSet.has(preferredWall) : false;
            const targetWall = mount === "wall" ? (hasWall ? preferredWall : neutralWall) : undefined;
            const side = (mount === "wall" ? targetWall : undefined) as WallSide | undefined;
            const floating = mount === "wall" ? Boolean(binding?.floating || !hasWall) : false;
            // Position & Rotation
            let px = scr.position?.x ?? 0;
            let pz = scr.position?.z ?? 0;
            let rotY = scr.rotationY ?? 0;
            const screenClearance = clearanceFor("screen", scr.clearance);
            const thickness = Math.max(t, 0.05);
            const footprintDepth = mount === "floor" ? Math.max(thickness, 0.1) : mount === "truss" ? w * 0.25 : thickness;
            const videoSrc = scr.videoUrl;
            const videoMuted = scr.videoMuted ?? true;
            const videoPaused = scr.videoPaused ?? false;
            const videoVolume = scr.videoVolume ?? 0;
            // Clamping je nach Mount
            if (mount === "wall") {
              if (!side) {
                return null;
              }
              if (side === "back") {
                pz = backWallFrontZ;
                const c = clampXZ(px, pz, width, depth, w / 2, 0.001);
                px = c.x;
                rotY = 0;
              } else if (side === "left") {
                px = leftWallInnerX;
                const c = clampXZ(px, pz, width, depth, 0.001, h / 2);
                pz = c.z;
                rotY = Math.PI / 2;
              } else {
                px = rightWallInnerX;
                const c = clampXZ(px, pz, width, depth, 0.001, h / 2);
                pz = c.z;
                rotY = -Math.PI / 2;
              }
            } else if (mount === "floor") {
              const c = clampXZ(px, pz, width, depth, w / 2, t / 2);
              px = c.x;
              pz = c.z;
            }
            const dragSize = { w, d: footprintDepth, clearance: screenClearance, rotation: rotY };
            const translationMask: [boolean, boolean, boolean] =
              mount === "wall"
                ? side === "back"
                  ? [true, false, false]
                  : [false, false, true]
                : [true, false, true];
            const boundW = mount === "wall" && (side === "left" || side === "right") ? thickness : w;
            const boundD = mount === "wall" && (side === "left" || side === "right") ? w : thickness;
            const screenBox = registerBounds(
              key,
              new THREE.Box3(
                new THREE.Vector3(px - boundW / 2, floorHeight + y - h / 2, pz - boundD / 2),
                new THREE.Vector3(px + boundW / 2, floorHeight + y + h / 2, pz + boundD / 2)
              )
            );
            return (
              <Transformable
                key={key}
                enabled={editMode && (selected || draggedKey === key)}
                mode={transformMode}
                snap={snapOn}
                snapStep={snapStep}
                physics={{
                  enabled: editMode && (selected || draggedKey === key),
                  type: "dynamic",
                  colliders: false,
                  childrenColliders: (
                    <CuboidCollider
                      args={
                        mount === "wall"
                          ? side === "left" || side === "right"
                            ? [thickness / 2, h / 2, w / 2]
                            : [w / 2, h / 2, thickness / 2]
                          : [w / 2, Math.max(h, 0.4) / 2, Math.max(footprintDepth, 0.08) / 2]
                      }
                    />
                  ),
                  mass: Math.max(2.2, w * h * 0.9),
                  restitution: 0.1,
                  friction: 0.8,
                  linearDamping: 3.4,
                  angularDamping: 6,
                  gravityScale: mount === "wall" ? 0 : 1,
                  enabledTranslations: translationMask,
                  enabledRotations: [false, true, false],
                  impactRadius: Math.max(w, h) * 0.45,
                  onCollisionChange: (state) => setCollisionState(key, state),
                }}
                onDragStart={() => startDrag(key, dragSize)}
                onDragEnd={endDrag}
                onChange={(pos) => {
                  let nextX = pos.x;
                  let nextZ = pos.z;
                  if (mount === "wall" && side) {
                    if (side === "back") {
                      const c = clampXZ(nextX, backWallFrontZ, width, depth, w / 2, 0.001);
                      nextX = c.x;
                      nextZ = backWallFrontZ;
                    } else if (side === "left") {
                      const c = clampXZ(leftWallInnerX, nextZ, width, depth, 0.001, h / 2);
                      nextX = leftWallInnerX;
                      nextZ = c.z;
                    } else {
                      const c = clampXZ(rightWallInnerX, nextZ, width, depth, 0.001, h / 2);
                      nextX = rightWallInnerX;
                      nextZ = c.z;
                    }
                  } else {
                    const c = clampXZ(nextX, nextZ, width, depth, w / 2, t / 2);
                    nextX = c.x;
                    nextZ = c.z;
                  }

                  let nextY = floorHeight + y;
                  if (snapOn && snapToStructure) {
                    const snapSpacing = Math.max(0.5, gridStep * 5);
                    const snapTargets: { x: number; z: number; rot: number; type: "wall" | "truss" }[] = [];
                    const addLinePoints = (
                      axis: "x" | "z",
                      constant: number,
                      span: number,
                      rot: number,
                      type: "wall" | "truss",
                      origin?: { x?: number; z?: number }
                    ) => {
                      const half = span / 2;
                      const shiftX = origin?.x ?? 0;
                      const shiftZ = origin?.z ?? 0;
                      for (let offset = -half; offset <= half + 1e-6; offset += snapSpacing) {
                        const x = (axis === "x" ? offset : constant) + shiftX;
                        const z = (axis === "x" ? constant : offset) + shiftZ;
                        snapTargets.push({ x, z, rot, type });
                      }
                    };

                    if (allowedWallsSet.has("back")) addLinePoints("x", backWallFrontZ, width, 0, "wall");
                    if (allowedWallsSet.has("left")) addLinePoints("z", leftWallInnerX, depth, Math.PI / 2, "wall");
                    if (allowedWallsSet.has("right")) addLinePoints("z", rightWallInnerX, depth, -Math.PI / 2, "wall");
                    if (trussEnabled) {
                      addLinePoints("x", trussOffsetZ + depth / 2, width, Math.PI, "truss", { x: trussOffsetX });
                      addLinePoints("x", trussOffsetZ - depth / 2, width, 0, "truss", { x: trussOffsetX });
                      addLinePoints("z", trussOffsetX - width / 2, depth, Math.PI / 2, "truss", { z: trussOffsetZ });
                      addLinePoints("z", trussOffsetX + width / 2, depth, -Math.PI / 2, "truss", { z: trussOffsetZ });
                    }

                    setSnapMarkers(snapTargets);

                    const snapRadius = Math.max(snapSpacing * 0.75, gridStep * 1.5);
                    let best:
                      | {
                          x: number;
                          z: number;
                          rot: number;
                          type: "wall" | "truss";
                          dist: number;
                        }
                      | null = null;
                    for (const target of snapTargets) {
                      const dx = target.x - nextX;
                      const dz = target.z - nextZ;
                      const dist = Math.hypot(dx, dz);
                      if (dist < snapRadius && (!best || dist < best.dist)) {
                        best = { ...target, dist };
                      }
                    }
                    if (best) {
                      nextX = best.x;
                      nextZ = best.z;
                      rotY = best.rot;
                      if (best.type === "truss") {
                        nextY = Math.max(nextY, trussHeight - 0.4);
                      }
                    }
                  } else {
                    setSnapMarkers([]);
                  }

                  const { position: resolved } = resolvePredictiveMove(
                    key,
                    { x: nextX, z: nextZ },
                    (p) => [makeObb(key, "Screen", p.x, p.z, w, footprintDepth, screenClearance, rotY)],
                    { fallback: { x: px, z: pz } }
                  );
                  const nextPos = new THREE.Vector3(resolved.x, nextY, resolved.z);
                  pos.copy(nextPos);
                  const next = screensDetailed.map((s0) =>
                    s0.id === scr.id
                      ? {
                          ...s0,
                          position: { x: resolved.x, z: resolved.z },
                          wallSide: side ?? s0.wallSide,
                          rotationY: rotY,
                        }
                      : s0
                  );
                  setConfig({ modules: { detailedScreens: next } });
                  const base = groupDragSnapshot.current[key] ?? { x: px, z: pz };
                  const delta = { x: resolved.x - base.x, z: resolved.z - base.z };
                  if (Math.hypot(delta.x, delta.z) > 1e-4) applyGroupDelta(key, delta);
                  return nextPos;
                }}
              >
                <group
                  position={[px, floorHeight + y, pz]}
                  rotation-y={rotY}
                onClick={(e) => handleSelectKey(e, key, "screen")}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(key);
                  void frameBox(screenBox);
                }}
                onContextMenu={(e) => openContextMenuForSelection(e, key, "screen")}
              >
                  <ScreenPanel
                    w={w}
                    h={h}
                    t={t}
                    materialize={pbr}
                    videoSrc={videoSrc}
                    videoMuted={videoMuted}
                    videoPaused={videoPaused}
                    videoVolume={videoVolume}
                  />
                  {selected && (
                    <mesh>
                      <boxGeometry args={[w, h, t]} />
                      <meshBasicMaterial wireframe color="#f43f5e" />
                    </mesh>
                  )}
                  {floating && (
                    <Html center position={[0, h + 0.08, 0]}>
                      <div
                        style={{
                          background: "#0f172a",
                          color: "#facc15",
                          padding: "4px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          boxShadow: "0 6px 12px rgba(0,0,0,0.35)",
                        }}
                      >
                        Wand fehlt - wird temporaer verschoben
                      </div>
                    </Html>
                  )}
                  {collidingKeys.has(key) && (
                    <Html center position={[0, h + 0.05, 0]}>
                      <div
                        style={{
                          background: "#991b1b",
                          color: "white",
                          padding: "4px 8px",
                          borderRadius: 8,
                          fontSize: 12,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                        }}
                      >
                        Screen kollidiert
                      </div>
                    </Html>
                  )}
                </group>
              </Transformable>
            );
          })
        : // Legacy Screens
          Array.from({ length: screens ?? 0 }).map((_, idx) => {
            const total = screens || 1;
            if (screensWallSide === "back") {
              const spacing = width / (total + 1);
              const xPos = -width / 2 + spacing * (idx + 1);
              const w = 0.9;
              const h = 0.55;
              const t = 0.02;
              const legacyKey = `screen-${idx}`;
              const screenBox = registerBounds(
                legacyKey,
                new THREE.Box3(
                  new THREE.Vector3(xPos - w / 2, floorHeight + 1.6 - h / 2, backWallFrontZ - t / 2),
                  new THREE.Vector3(xPos + w / 2, floorHeight + 1.6 + h / 2, backWallFrontZ + t / 2)
                )
              );
              return (
                <group
                  key={legacyKey}
                  position={[xPos, floorHeight + 1.6, backWallFrontZ]}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(legacyKey);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(legacyKey);
                    void frameBox(screenBox);
                  }}
                >
                  <ScreenPanel materialize={pbr} />
                </group>
              );
            }
            if (screensWallSide === "left") {
              const spacing = depth / (total + 1);
              const zPos = -depth / 2 + spacing * (idx + 1);
              const w = 0.9;
              const h = 0.55;
              const t = 0.02;
              const legacyKey = `screen-${idx}`;
              const screenBox = registerBounds(
                legacyKey,
                new THREE.Box3(
                  new THREE.Vector3(leftWallInnerX - t / 2, floorHeight + 1.6 - h / 2, zPos - w / 2),
                  new THREE.Vector3(leftWallInnerX + t / 2, floorHeight + 1.6 + h / 2, zPos + w / 2)
                )
              );
              return (
                <group
                  key={legacyKey}
                  position={[leftWallInnerX, floorHeight + 1.6, zPos]}
                  rotation-y={Math.PI / 2}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(legacyKey);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(legacyKey);
                    void frameBox(screenBox);
                  }}
                >
                  <ScreenPanel materialize={pbr} />
                </group>
              );
            }
            const spacing = depth / (total + 1);
            const zPos = -depth / 2 + spacing * (idx + 1);
            const w = 0.9;
            const h = 0.55;
            const t = 0.02;
            const legacyKey = `screen-${idx}`;
            const screenBox = registerBounds(
              legacyKey,
              new THREE.Box3(
                new THREE.Vector3(rightWallInnerX - t / 2, floorHeight + 1.6 - h / 2, zPos - w / 2),
                new THREE.Vector3(rightWallInnerX + t / 2, floorHeight + 1.6 + h / 2, zPos + w / 2)
              )
            );
            return (
              <group
                key={legacyKey}
                position={[rightWallInnerX, floorHeight + 1.6, zPos]}
                rotation-y={-Math.PI / 2}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(legacyKey);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(legacyKey);
                  void frameBox(screenBox);
                }}
              >
                <ScreenPanel materialize={pbr} />
              </group>
            );
          })}
      {/* Wand-Strahler R++ckwand */}
      {wallLightsBack > 0 &&
        wallsClosedSides >= 1 &&
        Array.from({ length: wallLightsBack }).map((_, i) => {
          const spacing = width / (wallLightsBack + 1);
          const x = -width / 2 + spacing * (i + 1);
          const y = floorHeight + wallHeight - 0.3;
          const z = backWallFrontZ + 0.05;
          return (
            <group key={`wall-back-light-${i}`}>
              <mesh position={[x, y, z]} castShadow>
                <sphereGeometry args={[0.05, 12, 12]} />
                <meshStandardMaterial
                  {...pbr({
                    color: "#facc15",
                    emissive: "#facc15",
                    emissiveIntensity: 1.1,
                    roughness: 0.35,
                    metalness: 0.05,
                  })}
                />
              </mesh>
              <pointLight position={[x, y - 0.05, z + 0.05]} intensity={0.9} distance={4} decay={2} color="#fee2b3" />
            </group>
          );
        })}
      {/* Wand-Strahler linke Wand */}
      {wallLightsLeft > 0 &&
        wallsClosedSides >= 2 &&
        Array.from({ length: wallLightsLeft }).map((_, i) => {
          const spacing = depth / (wallLightsLeft + 1);
          const z = -depth / 2 + spacing * (i + 1);
          const y = floorHeight + wallHeight - 0.3;
          const x = leftWallInnerX + 0.05;
            return (
              <group key={`wall-left-light-${i}`}>
                <mesh position={[x, y, z]} castShadow>
                  <sphereGeometry args={[0.05, 12, 12]} />
                  <meshStandardMaterial
                    {...pbr({
                      color: "#facc15",
                      emissive: "#facc15",
                      emissiveIntensity: 1.1,
                      roughness: 0.35,
                      metalness: 0.05,
                    })}
                  />
                </mesh>
                <pointLight position={[x + 0.05, y - 0.05, z]} intensity={0.9} distance={4} decay={2} color="#fee2b3" />
              </group>
            );
          })}
      {/* Wand-Strahler rechte Wand */}
      {wallLightsRight > 0 &&
        wallsClosedSides >= 3 &&
        Array.from({ length: wallLightsRight }).map((_, i) => {
          const spacing = depth / (wallLightsRight + 1);
          const z = -depth / 2 + spacing * (i + 1);
          const y = floorHeight + wallHeight - 0.3;
          const x = rightWallInnerX - 0.05;
          return (
            <group key={`wall-right-light-${i}`}>
              <mesh position={[x, y, z]} castShadow>
                <sphereGeometry args={[0.05, 12, 12]} />
                <meshStandardMaterial
                  {...pbr({
                    color: "#facc15",
                    emissive: "#facc15",
                    emissiveIntensity: 1.1,
                    roughness: 0.35,
                    metalness: 0.05,
                  })}
                />
              </mesh>
              <pointLight position={[x - 0.05, y - 0.05, z]} intensity={0.9} distance={4} decay={2} color="#fee2b3" />
            </group>
          );
        })}
      {/* Truss ÔÇô Rahmen + Lampen + Bannerrahmen (mit Offset & Drag-Griff) */}
      {trussEnabled &&
        (() => {
          const frameThickness = 0.08;
          const trussLodDistances = [8, 16].map((d) => d * lodScale);

          const trussLights: Array<{
            key: string;
            position: [number, number, number];
            lightPos: [number, number, number];
          }> = [];
          const addLight = (
            key: string,
            x: number,
            y: number,
            z: number,
            lx: number,
            ly: number,
            lz: number
          ) => {
            trussLights.push({ key, position: [x, y, z], lightPos: [lx, ly, lz] });
          };

          if (trussLightsFront > 0) {
            Array.from({ length: trussLightsFront }).forEach((_, i) => {
              const spacing = width / (trussLightsFront + 1);
              const x = -width / 2 + spacing * (i + 1);
              const y = trussHeight - 0.05;
              const z = depth / 2 - 0.04;
              addLight(`truss-front-${i}`, x, y, z, x, y - 0.15, z - 0.25);
            });
          }
          if (trussLightsBack > 0) {
            Array.from({ length: trussLightsBack }).forEach((_, i) => {
              const spacing = width / (trussLightsBack + 1);
              const x = -width / 2 + spacing * (i + 1);
              const y = trussHeight - 0.05;
              const z = -depth / 2 + 0.04;
              addLight(`truss-back-${i}`, x, y, z, x, y - 0.15, z + 0.25);
            });
          }
          if (trussLightsLeft > 0) {
            Array.from({ length: trussLightsLeft }).forEach((_, i) => {
              const spacing = depth / (trussLightsLeft + 1);
              const z = -depth / 2 + spacing * (i + 1);
              const y = trussHeight - 0.05;
              const x = -width / 2 + 0.04;
              addLight(`truss-left-${i}`, x, y, z, x + 0.25, y - 0.15, z);
            });
          }
          if (trussLightsRight > 0) {
            Array.from({ length: trussLightsRight }).forEach((_, i) => {
              const spacing = depth / (trussLightsRight + 1);
              const z = -depth / 2 + spacing * (i + 1);
              const y = trussHeight - 0.05;
              const x = width / 2 - 0.04;
              addLight(`truss-right-${i}`, x, y, z, x - 0.25, y - 0.15, z);
            });
          }

          const lightsHigh = trussLights.map((light) =>
            renderTrussLight(light.key, light.position[0], light.position[1], light.position[2], ...light.lightPos)
          );
          const lightsMedium = trussLights.map((light) => (
            <mesh key={`${light.key}-medium`} position={light.position} castShadow={false}>
              <boxGeometry args={[0.14, 0.08, 0.1]} />
              <meshStandardMaterial
                {...pbr({
                  color: "#fde68a",
                  emissive: "#f59e0b",
                  emissiveIntensity: 0.75,
                  roughness: 0.4,
                  metalness: 0.2,
                })}
              />
            </mesh>
          ));
          const lightsLow = trussLights.map((light) => (
            <mesh key={`${light.key}-low`} position={light.position} castShadow={false}>
              <boxGeometry args={[0.12, 0.06, 0.12]} />
              <meshBasicMaterial color="#facc15" />
            </mesh>
          ));

          return (
            <group
              position={[trussOffsetX, 0, trussOffsetZ]}
              onContextMenu={(e: ThreeEvent<MouseEvent>) => openContextMenuForSelection(e, "truss", "truss")}
            >
              {registerBounds(
                "truss",
                new THREE.Box3(
                  new THREE.Vector3(trussOffsetX - width / 2, floorHeight, trussOffsetZ - depth / 2),
                  new THREE.Vector3(trussOffsetX + width / 2, trussHeight + 0.6, trussOffsetZ + depth / 2)
                )
              ) && null}
              {/* Drag-Griff f++r Truss (EditMode) */}
              <Transformable
                enabled={editMode && isSelected("truss")}
                mode={transformMode}
                snap={snapOn}
                snapStep={snapStep}
                onDragStart={() => startDrag("truss", { w: width, d: depth, clearance: 0 })}
                onDragEnd={endDrag}
                onChange={(pos) => {
                  const resolved = clampXZ(pos.x, pos.z, width, depth, 0.4, 0.4);
                  const next = new THREE.Vector3(resolved.x, pos.y, resolved.z);
                  pos.copy(next);
                  setConfig({ modules: { trussOffset: { x: resolved.x, z: resolved.z } } });
                  const base = groupDragSnapshot.current["truss"] ?? { x: trussOffsetX, z: trussOffsetZ };
                  const delta = { x: resolved.x - base.x, z: resolved.z - base.z };
                  if (Math.hypot(delta.x, delta.z) > 1e-4) applyGroupDelta("truss", delta);
                  return next;
                }}
              >
                <group
                  position={[0, trussHeight, 0]}
                  onClick={(e) => handleSelectKey(e, "truss", "truss")}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey("truss");
                    void frameSelection("truss");
                  }}
                >
                  {/* Kleiner visueller Griff */}
                  {editMode && (
                    <mesh>
                      <torusGeometry args={[0.25, 0.02, 8, 24]} />
                      <meshStandardMaterial
                        {...pbr({ color: "#22d3ee", metalness: 0.7, roughness: 0.25 })}
                      />
                    </mesh>
                  )}
                  {collidingKeys.has("truss") && (
                    <Html center position={[0, 0.4, 0]}>
                      <div
                        style={{
                          background: "#991b1b",
                          color: "white",
                          padding: "4px 8px",
                          borderRadius: 8,
                          fontSize: 12,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                        }}
                      >
                        Truss kollidiert
                      </div>
                    </Html>
                  )}
                </group>
              </Transformable>
              <Traverse
                width={width}
                depth={depth}
                height={trussHeight}
                frameThickness={frameThickness}
                strutSpacing={modules.trussSegmentLength ?? 1}
                envMapIntensity={envMapIntensity}
                lodDistances={trussLodDistances}
                materialize={pbr}
              />
              {trussLights.length > 0 && (
                <Detailed distances={trussLodDistances}>
                  <group>{lightsHigh}</group>
                  <group>{lightsMedium}</group>
                  <group>{lightsLow}</group>
                </Detailed>
              )}
              {/* Bannerrahmen */}
              {hasTrussBanners && (
                <Suspense fallback={null}>
                  <LazyTrussBanners
                    width={width}
                    depth={depth}
                    trussHeight={trussHeight}
                    bannerWidth={bannerWidth}
                    bannerHeight={bannerHeight}
                    bannerThickness={bannerThickness}
                    bannersFront={bannersFront}
                    bannersBack={bannersBack}
                    bannersLeft={bannersLeft}
                    bannersRight={bannersRight}
                    bannerWebpUrl={bannerWebpUrl}
                    bannerMipmaps={bannerMipmaps}
                    bannerKtx2Url={bannerKtx2Url}
                    blankFallback={BLANK_PNG}
                  />
                </Suspense>
              )}
            </group>
          );
        })()}
    </group>
  );
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function CameraRig({
  orbitRef,
  onMoveStateChange,
  dprScale = 1,
  fallbackQuality = false,
  isCameraMoving = false,
}: {
  orbitRef: MutableRefObject<CameraControlsImpl | null>;
  onMoveStateChange?: (moving: boolean) => void;
  dprScale?: number;
  fallbackQuality?: boolean;
  isCameraMoving?: boolean;
}) {
  const config = useConfigStore((s) => s.config);
  const setCurrentPose = useCameraStore((s) => s.setCurrentPose);
  const nextAction = useCameraStore((s) => s.nextAction);
  const clearAction = useCameraStore((s) => s.clearAction);
  const guides = useCameraStore((s) => s.guides);
  const setLodScale = useCameraStore((s) => s.setLodScale);
  const defaultMouseButtons = useMemo(() => DEFAULT_MOUSE_BUTTONS, []);

  const lastPoseRef = useRef<CameraPose | null>(null);
  const lastPoseEmitAt = useRef<number>(0);
  const activeActionRef = useRef<number | null>(null);
  const scratchPos = useMemo(() => new THREE.Vector3(), []);
  const scratchTarget = useMemo(() => new THREE.Vector3(), []);
  const lastQualityRef = useRef<{ lod: number; dpr: number }>({ lod: 1, dpr: 1 });
  const moveIdleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPoseRef = useRef<{ width: number; depth: number; height: number } | null>(null);

  const floorRaised = config.modules.floor?.raised ?? config.modules.raisedFloor ?? false;
  const floorHeight = floorRaised ? 0.08 : 0.025;

  const markCameraMovement = useCallback(() => {
    if (!onMoveStateChange) return;
    onMoveStateChange(true);
    if (moveIdleTimeout.current) clearTimeout(moveIdleTimeout.current);
    moveIdleTimeout.current = setTimeout(() => onMoveStateChange(false), 240);
  }, [onMoveStateChange]);

  useEffect(
    () => () => {
      if (moveIdleTimeout.current) clearTimeout(moveIdleTimeout.current);
    },
    []
  );

  const distanceRange = useMemo(() => {
    const standDiagonal = Math.sqrt(config.width * config.width + config.depth * config.depth);
    const standHeight = config.height + floorHeight;
    const min = Math.max(2.2, standDiagonal * 0.55, standHeight * 0.8);
    const max = Math.max(min + 6, standDiagonal * 2.6);
    return { min, max, standDiagonal, standHeight };
  }, [config.depth, config.height, config.width, floorHeight]);

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    const previous = initialPoseRef.current;
    const changed =
      !previous ||
      previous.width !== config.width ||
      previous.depth !== config.depth ||
      previous.height !== config.height;
    if (!changed) return;

    const targetY = Math.min(
      Math.max(config.height * 0.45 + floorHeight, floorHeight + 1.25),
      floorHeight + Math.max(config.height * 0.85, 2.2)
    );
    const target: CameraPose["target"] = [0, targetY, 0];
    const baseDistance = Math.max(
      distanceRange.min * 1.05,
      distanceRange.standDiagonal * 1.15,
      distanceRange.standHeight * 1.2
    );
    const direction = new THREE.Vector3(0.62, 0.5, 0.62).normalize();
    const position = direction.multiplyScalar(baseDistance).add(new THREE.Vector3(target[0], target[1], target[2]));
    controls.setLookAt(position.x, position.y, position.z, target[0], target[1], target[2], false);
    initialPoseRef.current = { width: config.width, depth: config.depth, height: config.height };
  }, [
    config.depth,
    config.height,
    config.width,
    distanceRange.min,
    distanceRange.standDiagonal,
    distanceRange.standHeight,
    floorHeight,
    orbitRef,
  ]);

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;

    controls.minPolarAngle = MIN_PITCH_RAD;
    controls.maxPolarAngle = MAX_PITCH_RAD;
    controls.mouseButtons = defaultMouseButtons;

    controls.infinityDolly = true;
    controls.minDistance = distanceRange.min;
    controls.maxDistance = distanceRange.max;
    controls.dollyToCursor = true;
    controls.draggingSmoothTime = 0.22;
    controls.smoothTime = 0.82;
    controls.truckSpeed = 0.65;
    controls.dollySpeed = 0.9;
    controls.azimuthRotateSpeed = 0.9;
    controls.polarRotateSpeed = 0.9;

    const padding = Math.max(config.width, config.depth) * 0.1 + 0.8;
    const resolvedTrussHeight =
      config.traverseHeight ?? config.modules.trussHeight ?? config.height + 0.5;
    const trussCeiling = config.modules.truss ? resolvedTrussHeight + 1 : 0;
    const maxSceneHeight = Math.max(config.height + floorHeight + 2, trussCeiling);
    controls.setBoundary(
      new THREE.Box3(
        new THREE.Vector3(-config.width / 2 - padding, 0, -config.depth / 2 - padding),
        new THREE.Vector3(config.width / 2 + padding, maxSceneHeight, config.depth / 2 + padding)
      )
    );
    controls.boundaryEnclosesCamera = true;
    controls.boundaryFriction = 0.3;
    controls.restThreshold = 0.0005;
  }, [
    config.depth,
    config.height,
    config.modules.truss,
    config.modules.trussHeight,
    config.traverseHeight,
    config.width,
    distanceRange.max,
    distanceRange.min,
    defaultMouseButtons,
    floorHeight,
    orbitRef,
  ]);

  const withTransition = useCallback(
    (durationSec: number) => {
      const controls = orbitRef.current;
      if (!controls) return () => {};

      const prevSmooth = controls.smoothTime;
      const prevMaxSpeed = controls.maxSpeed;
      const safeDuration = Math.max(0.2, Math.min(durationSec, 3));

      controls.smoothTime = safeDuration;
      controls.maxSpeed = Math.max(prevMaxSpeed, distanceRange.max / Math.max(safeDuration, 0.01));

      return () => {
        controls.smoothTime = prevSmooth;
        controls.maxSpeed = prevMaxSpeed;
      };
    },
    [distanceRange.max, orbitRef]
  );

  useEffect(() => {
    const action = nextAction;
    const controls = orbitRef.current;
    if (!controls || !action) return;

    let cancelled = false;

    const run = async () => {
      const durationSec = Math.max(0.25, action.duration ?? 0.9);
      const restore = withTransition(durationSec);
      activeActionRef.current = action.id;
      controls.stop();

      if (action.type === "flyTo") {
        const target = action.pose.target ?? [0, floorHeight + 1.4, 0];
        await controls.setLookAt(
          action.pose.position[0],
          action.pose.position[1],
          action.pose.position[2],
          target[0],
          target[1],
          target[2],
          true
        );
      } else if (action.type === "playGuide") {
        const guide = guides.find((g) => g.id === action.guideId);
        if (!guide || guide.waypoints.length === 0) {
          clearAction(action.id);
          restore();
          return;
        }

        for (const waypoint of guide.waypoints) {
          const target = waypoint.target ?? [0, floorHeight + 1.4, 0];
          await controls.setLookAt(
            waypoint.position[0],
            waypoint.position[1],
            waypoint.position[2],
            target[0],
            target[1],
            target[2],
            true
          );
          if (cancelled || activeActionRef.current !== action.id) break;
        }
      } else {
        // Exhaustive check: if a new action type is added, TypeScript will error here
        const _exhaustive: never = action;
        void _exhaustive;
        restore();
        return;
      }

      if (!cancelled && activeActionRef.current === action.id) {
        clearAction(action.id);
        activeActionRef.current = null;
      }

      restore();
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [clearAction, floorHeight, guides, nextAction, orbitRef, withTransition]);

  useFrame((state, delta) => {
    const controls = orbitRef.current;
    if (!controls) return;

    controls.update(delta);

    controls.getPosition(scratchPos);
    controls.getTarget(scratchTarget);

    const pose: CameraPose = {
      position: [scratchPos.x, scratchPos.y, scratchPos.z],
      target: [scratchTarget.x, scratchTarget.y, scratchTarget.z],
    };
    const now = performance.now();

    const prev = lastPoseRef.current;
    const changed =
      !prev ||
      Math.abs(prev.position[0] - pose.position[0]) > 1e-3 ||
      Math.abs(prev.position[1] - pose.position[1]) > 1e-3 ||
      Math.abs(prev.position[2] - pose.position[2]) > 1e-3 ||
      Math.abs(prev.target[0] - pose.target[0]) > 1e-3 ||
      Math.abs(prev.target[1] - pose.target[1]) > 1e-3 ||
      Math.abs(prev.target[2] - pose.target[2]) > 1e-3;

    if (changed && (now - lastPoseEmitAt.current > 120 || lastPoseEmitAt.current === 0)) {
      lastPoseRef.current = pose;
      lastPoseEmitAt.current = now;
      setCurrentPose(pose);
      markCameraMovement();
    }

    const distance = controls.distance;
    const range = Math.max(0.01, distanceRange.max - distanceRange.min);
    const normalized = clamp01((distance - distanceRange.min) / range);

    const lodScale = (fallbackQuality ? 0.7 : 0.85) + (1 - normalized) * 0.65;
    if (Math.abs(lodScale - lastQualityRef.current.lod) > 0.05) {
      lastQualityRef.current.lod = lodScale;
      setLodScale(lodScale);
    }

    const rawDpr = Math.min(window.devicePixelRatio * 1.35, 0.9 + (1 - normalized) * 0.8);
    const movementFactor = isCameraMoving ? 0.75 : 1;
    const perfAwareDpr = clampDprValue(rawDpr * dprScale * movementFactor);
    const targetDpr = fallbackQuality ? Math.min(perfAwareDpr, 0.75) : perfAwareDpr;
    if (Math.abs(targetDpr - lastQualityRef.current.dpr) > 0.05) {
      lastQualityRef.current.dpr = targetDpr;
      state.setDpr(targetDpr);
    }
  });

  return null;
}

function ToneMappingController({
  toneMapping,
  exposure,
}: {
  toneMapping: LightingToneMapping;
  exposure: number;
}) {
  const { gl } = useThree();

  useEffect(() => {
    const mapping =
      toneMapping === "aces"
        ? THREE.ACESFilmicToneMapping
        : toneMapping === "agx"
        ? THREE.AgXToneMapping
        : toneMapping === "reinhard"
        ? THREE.ReinhardToneMapping
        : THREE.NeutralToneMapping;
    // three.js renderer is mutable; update tone mapping imperatively
    // eslint-disable-next-line react-hooks/immutability
    gl.toneMapping = mapping;
    gl.toneMappingExposure = exposure;
    invalidate();
  }, [exposure, gl, toneMapping]);

  return null;
}

function RendererStatsCollector({ onStats }: { onStats: (stats: RendererStats) => void }) {
  const { gl } = useThree();
  const frameCounter = useRef(0);
  const lastSnapshot = useRef<number>(0);

  useFrame(() => {
    frameCounter.current += 1;

    if (lastSnapshot.current === 0) {
      lastSnapshot.current = performance.now();
      return;
    }

    const now = performance.now();
    const elapsed = now - lastSnapshot.current;

    if (elapsed < 400) return;

    const info = gl.info;
    const fps = (frameCounter.current * 1000) / elapsed;
    const frameMs = elapsed / Math.max(frameCounter.current, 1);

    onStats({
      fps: Number.isFinite(fps) ? fps : 0,
      frameMs: Number.isFinite(frameMs) ? frameMs : 0,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: Array.isArray(info.programs) ? info.programs.length : 0,
    });

    frameCounter.current = 0;
    lastSnapshot.current = now;
  });

  return null;
}


export default function Configurator3D() {
  const [debugOpen, setDebugOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("debug3d");
  });
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [rendererStats, setRendererStats] = useState<RendererStats | null>(null);
  const logDebugEvent = useCallback((event: DebugEventInput) => {
    setDebugEvents((prev) => {
      const nextEvent: DebugEvent = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        timestamp: Date.now(),
        ...event,
      };
      return [nextEvent, ...prev].slice(0, 30);
    });
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = normalizeEventKey(event);
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "d") {
        event.preventDefault();
        setDebugOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!debugOpen) return;
    queueMicrotask(() => logDebugEvent({ title: "Debug HUD opened", details: "Capturing 3D diagnostics" }));
  }, [debugOpen, logDebugEvent]);
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      logDebugEvent({
        title: "Runtime error",
        details: event.message,
        level: "error",
        meta: { source: event.filename, line: event.lineno, column: event.colno },
      });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
      logDebugEvent({ title: "Unhandled rejection", details: reason, level: "error" });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [logDebugEvent]);
  const orbitRef = useRef<CameraControlsImpl | null>(null);
  const [baseDpr, setBaseDpr] = useState(() =>
    clampDprValue(Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1.5))
  );
  const [fallbackQuality, setFallbackQuality] = useState(false);
  const [isCameraMoving, setIsCameraMoving] = useState(false);
  const shadowMapSize = useMemo(
    () => (fallbackQuality ? 512 : isCameraMoving ? 768 : 1024),
    [fallbackQuality, isCameraMoving]
  );
  const contactShadowSettings = useMemo(
    () =>
      fallbackQuality
        ? { enabled: false, resolution: 256, blur: 2.4, opacity: 0.35 }
        : isCameraMoving
        ? { enabled: true, resolution: 512, blur: 2.2, opacity: 0.42 }
        : { enabled: true, resolution: 1024, blur: 1.8, opacity: 0.5 },
    [fallbackQuality, isCameraMoving]
  );
  const updateRendererStats = useCallback((stats: RendererStats) => setRendererStats(stats), []);
  const handleMovementChange = useCallback((moving: boolean) => {
    setIsCameraMoving(moving);
  }, []);
  const handlePerfDecline = useCallback(() => {
    setBaseDpr((prev) => {
      const next = clampDprValue(prev - 0.25);
      logDebugEvent({
        title: "Performance decline",
        details: `DPR ${prev.toFixed(2)} → ${next.toFixed(2)}`,
        level: "warn",
      });
      return next;
    });
  }, [logDebugEvent]);
  const handlePerfIncline = useCallback(() => {
    setFallbackQuality(false);
    setBaseDpr((prev) => {
      const next = clampDprValue(prev + 0.25);
      logDebugEvent({ title: "Performance recovery", details: `DPR ${prev.toFixed(2)} → ${next.toFixed(2)}` });
      return next;
    });
  }, [logDebugEvent]);
  const handlePerfFallback = useCallback(() => {
    setFallbackQuality(true);
    setBaseDpr((prev) => {
      const next = clampDprValue(Math.min(prev, 0.75));
      logDebugEvent({
        title: "Quality fallback",
        details: `Switched to low/steady DPR ${next.toFixed(2)}`,
        level: "warn",
      });
      return next;
    });
  }, [logDebugEvent]);
  const { t } = useTranslation();
  const editMode = useEditModeHotkey();
  const config = useConfigStore((s) => s.config);
  const modules = config.modules;
  const snapStep = Math.max(0.01, Math.min(1, modules.gridStep ?? modules.snapStep ?? 0.1));
  const queueAction = useCameraStore((s) => s.queueAction);
  const currentPose = useCameraStore((s) => s.currentPose);
  const lodScaleValue = useCameraStore((s) => s.lodScale);
  const selectionIds = useSceneInteractionStore((s) => s.selectionIds);
  const selectionType = useSceneInteractionStore((s) => s.selectionType);
  const selectionCenter = useSceneInteractionStore((s) => s.selectionCenter);
  const collisionState = useSceneInteractionStore((s) => s.collision);
  const lastSelectionRef = useRef<string[]>([]);
  const lastCollisionRef = useRef<typeof collisionState>(undefined);
  useEffect(() => {
    const previous = lastSelectionRef.current.join(",");
    const next = selectionIds.join(",");
    if (previous === next) return;
    lastSelectionRef.current = selectionIds;

    queueMicrotask(() =>
      logDebugEvent({
        title: selectionIds.length > 0 ? "Selection changed" : "Selection cleared",
        details: selectionIds.length > 0 ? selectionIds.join(", ") : "No active selection",
        meta: selectionCenter ? { center: selectionCenter, type: selectionType } : { type: selectionType },
      })
    );
  }, [logDebugEvent, selectionCenter, selectionIds, selectionType]);
  useEffect(() => {
    if (collisionState === lastCollisionRef.current) return;
    lastCollisionRef.current = collisionState;
    if (collisionState === undefined) return;

    const label =
      collisionState === true ? "hard" : collisionState === false ? "none" : (collisionState as string);

    queueMicrotask(() =>
      logDebugEvent({
        title: collisionState ? "Collision active" : "Collision cleared",
        details: label,
        level: collisionState ? "warn" : "info",
      })
    );
  }, [collisionState, logDebugEvent]);
  const formatVec = useCallback((vec?: [number, number, number]) => (vec ? vec.map((v) => v.toFixed(2)).join(" · ") : "–"), []);
  const moduleSummary = useMemo(
    () => ({
      countersLegacy: modules.counters ?? 0,
      countersDetailed: modules.countersDetailed?.length ?? 0,
      screensLegacy: modules.screens ?? 0,
      screensDetailed: modules.detailedScreens?.length ?? 0,
      seating: modules.chairsDetailed?.length ?? 0,
      truss: Boolean(modules.truss),
    }),
    [modules]
  );
  const floorRaised = config.modules.floor?.raised ?? config.modules.raisedFloor ?? false;
  const floorHeight = floorRaised ? 0.08 : 0.025;

  const frameAll = useCallback(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    const resolvedTrussHeight =
      config.traverseHeight ?? config.modules.trussHeight ?? config.height + 0.5;
    const trussCeiling = config.modules.truss ? resolvedTrussHeight + 1 : 0;
    const maxSceneHeight = Math.max(config.height + floorHeight + 2, trussCeiling);
    const baseBox = new THREE.Box3(
      new THREE.Vector3(-config.width / 2, 0, -config.depth / 2),
      new THREE.Vector3(config.width / 2, maxSceneHeight, config.depth / 2)
    );
    const padding = Math.max(config.width, config.depth) * 0.1 + 0.8;
    const padded = baseBox.clone().expandByScalar(padding);
    controls.stop();
    void controls.fitToBox(padded, true);
  }, [
    config.depth,
    config.height,
    config.modules.truss,
    config.modules.trussHeight,
    config.traverseHeight,
    config.width,
    floorHeight,
    orbitRef,
  ]);

  const quickViews = useMemo(() => {
    const targetY = Math.min(
      Math.max(config.height * 0.45 + floorHeight, floorHeight + 1.2),
      floorHeight + Math.max(config.height * 0.85, 2)
    );
    const center: [number, number, number] = [0, targetY, 0];
    const orbitPadding = Math.max(Math.max(config.width, config.depth) * 0.65, 4.5);
    const flyHeight = Math.max(config.height + floorHeight + 2.2, targetY + 1.4);
    return [
      { id: "overview", label: t("camera.quick.overview"), pose: undefined },
      { id: "front", label: t("camera.quick.front"), pose: { position: [0, flyHeight, config.depth / 2 + orbitPadding] as [number, number, number], target: center } },
      { id: "top", label: t("camera.quick.top"), pose: { position: [0, flyHeight + orbitPadding * 0.45, 0.001] as [number, number, number], target: center } },
    ];
  }, [config.depth, config.height, config.width, floorHeight, t]);

  const handleQuickView = useCallback(
    (pose?: CameraPose) => {
      if (!pose) {
        frameAll();
        logDebugEvent({ title: "Quick view", details: "Frame all" });
        return;
      }
      queueAction({ type: "flyTo", pose, duration: 0.9 });
      logDebugEvent({
        title: "Quick view",
        details: "Fly to preset",
        meta: { position: pose.position, target: pose.target },
      });
    },
    [frameAll, logDebugEvent, queueAction]
  );

  useEffect(() => {
    const setPanMode = (pan: boolean) => {
      const controls = orbitRef.current;
      if (!controls) return;
      const base = controls.mouseButtons;
      controls.mouseButtons = {
        ...base,
        left: pan ? CameraControls.ACTION.TRUCK : CameraControls.ACTION.ROTATE,
      };
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") setPanMode(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") setPanMode(false);
    };
    setPanMode(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [orbitRef]);
  const lightingConfig = useConfigStore((s) => s.config.modules.lighting);
  const lightingSettings = useMemo<LightingSettings>(() => {
    const l = lightingConfig ?? {};
    const clamp = (v: unknown, min: number, max: number, fallback: number) => {
      const num = Number(v);
      return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
    };
    return {
      hdri: (l.hdri ?? "hall") as HdriPreset,
      background: l.background ?? false,
      ambientColor: l.ambientColor ?? "#ffffff",
      ambientIntensity: clamp(l.ambientIntensity, 0, 5, DEFAULT_LIGHTING.ambientIntensity),
      environmentIntensity: clamp(l.environmentIntensity, 0, 5, DEFAULT_LIGHTING.environmentIntensity),
      materialRoughness: clamp(l.materialRoughness, 0.2, 1.8, DEFAULT_LIGHTING.materialRoughness),
      materialMetalness: clamp(l.materialMetalness, 0.2, 1.8, DEFAULT_LIGHTING.materialMetalness),
      emissiveIntensity: clamp(l.emissiveIntensity, 0, 8, DEFAULT_LIGHTING.emissiveIntensity),
      exposure: clamp(l.exposure, 0.1, 3, DEFAULT_LIGHTING.exposure),
      toneMapping: (l.toneMapping ?? DEFAULT_LIGHTING.toneMapping) as LightingToneMapping,
      bloom: l.bloom ?? false,
      bloomIntensity: clamp(l.bloomIntensity, 0, 5, DEFAULT_LIGHTING.bloomIntensity),
      dof: l.dof ?? false,
      dofFocus: clamp(l.dofFocus, 0.001, 1, DEFAULT_LIGHTING.dofFocus),
      dofBokehScale: clamp(l.dofBokehScale, 0, 10, DEFAULT_LIGHTING.dofBokehScale),
      envMapIntensity: clamp(l.envMapIntensity, 0, 5, DEFAULT_LIGHTING.envMapIntensity),
    };
  }, [lightingConfig]);
  const envPreset = HDRI_PRESETS[lightingSettings.hdri] ?? HDRI_PRESETS.hall;
  const bloomActive = lightingSettings.bloom && !fallbackQuality;
  const dofActive = lightingSettings.dof && !fallbackQuality && !isCameraMoving;
  const bloomIntensity = isCameraMoving ? lightingSettings.bloomIntensity * 0.6 : lightingSettings.bloomIntensity;
  // Keep bloom subtle to maintain a clean "high-end" look without overpowering the scene.
  const cappedBloomIntensity = Math.min(bloomIntensity, 1);
  const postProcessingEnabled = bloomActive || dofActive;
  const canvasDpr = fallbackQuality ? Math.min(clampDprValue(baseDpr), 0.75) : baseDpr;
  const ambientIntensity = fallbackQuality ? lightingSettings.ambientIntensity * 0.9 : lightingSettings.ambientIntensity;
  const environmentIntensity = fallbackQuality
    ? lightingSettings.environmentIntensity * 0.85
    : lightingSettings.environmentIntensity;
  const keyLightIntensity = fallbackQuality ? 1.1 : isCameraMoving ? 1.25 : 1.4;
  const rimLightIntensity = fallbackQuality ? 0.3 : 0.4;
  const sceneContents = (
    <>
      {!lightingSettings.background && <color attach="background" args={[DEFAULT_BACKGROUND_COLOR]} />}
      <ambientLight intensity={ambientIntensity} color={lightingSettings.ambientColor} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={keyLightIntensity}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
      />
      <directionalLight position={[-4, 6, -4]} intensity={rimLightIntensity} />
      <Environment
        key={lightingSettings.hdri}
        preset={envPreset.preset}
        background={lightingSettings.background}
        environmentIntensity={environmentIntensity}
        blur={envPreset.blur}
      />
      <ToneMappingController toneMapping={lightingSettings.toneMapping} exposure={lightingSettings.exposure} />
      <Grid
        renderOrder={-1}
        position={[0, 0, 0]}
        infiniteGrid
        cellSize={snapStep}
        sectionSize={Math.max(snapStep * 6, 1)}
        fadeDistance={18}
        fadeStrength={2}
        cellThickness={0.5}
        sectionThickness={1.2}
      />
      <Physics gravity={[0, -9.81, 0]} colliders="hull">
        <Suspense fallback={null}>
          {/* OrbitRef an StandMesh weitergeben, damit Drag den Orbit sperrt */}
          <StandMesh
            orbitRef={orbitRef}
            editMode={editMode}
            lighting={lightingSettings}
            onFrameAll={frameAll}
            onDebugEvent={logDebugEvent}
          />
        </Suspense>
      </Physics>
      <CameraRig
        orbitRef={orbitRef}
        dprScale={canvasDpr}
        fallbackQuality={fallbackQuality}
        isCameraMoving={isCameraMoving}
        onMoveStateChange={handleMovementChange}
      />
      <RendererStatsCollector onStats={updateRendererStats} />
      {contactShadowSettings.enabled && (
        <ContactShadows
          position={[0, 0, 0]}
          opacity={contactShadowSettings.opacity}
          width={20}
          height={20}
          blur={contactShadowSettings.blur}
          far={15}
          resolution={contactShadowSettings.resolution}
          color="#000000"
        />
      )}
      {postProcessingEnabled && (
        <EffectComposer>
          {bloomActive && (
            <Bloom
              mipmapBlur
              luminanceThreshold={0.18}
              intensity={cappedBloomIntensity}
            />
          )}
          {dofActive && (
            <DepthOfField
              focusDistance={lightingSettings.dofFocus}
              focalLength={0.02}
              bokehScale={lightingSettings.dofBokehScale}
              height={480}
            />
          )}
        </EffectComposer>
      )}
      <DreiCameraControls
        ref={orbitRef}
        makeDefault
        minPolarAngle={MIN_PITCH_RAD}
        maxPolarAngle={MAX_PITCH_RAD}
        dollyToCursor
        smoothTime={0.82}
        draggingSmoothTime={0.22}
        mouseButtons={DEFAULT_MOUSE_BUTTONS}
        touches={{
          one: CameraControls.ACTION.TOUCH_ROTATE,
          two: CameraControls.ACTION.TOUCH_DOLLY_TRUCK,
          three: CameraControls.ACTION.NONE,
        }}
        onStart={() => handleMovementChange(true)}
        onEnd={() => handleMovementChange(false)}
        onRest={() => handleMovementChange(false)}
      />
    </>
  );
  return (
    <div className="viewport-shell">
      <Canvas
        dpr={canvasDpr}
        shadows
        camera={{ position: [6, 5, 8], fov: 45 }}
        className="canvas-root"
        onPointerMissed={() => {
          // Fallback-Deselect, falls obere Ebene Events nicht bekommt
          // (Selektion-Reset passiert primaer in StandMesh)
        }}
        onDoubleClick={() => {
          frameAll();
        }}
      >
        {/* PerformanceMonitor muss ein direktes Canvas-Kind bleiben, damit die R3F-Hooks einen gültigen Kontext finden. */}
        <PerformanceMonitor
          flipflops={6}
          onDecline={handlePerfDecline}
          onIncline={handlePerfIncline}
          onFallback={handlePerfFallback}
        />
        {sceneContents}
      </Canvas>
      <div className="hud-controls">
        <div style={{ fontWeight: 700, fontSize: 13 }}>{t("camera.quick.overview")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {quickViews.map((view) => (
            <button
              key={view.id}
              type="button"
              className="btn-secondary"
              onClick={() => handleQuickView(view.pose)}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>
      <div className="hud-legend">
        <div className="legend-title">{t("legend.title")}</div>
        <ul>
          <li>{t("legend.rotate")}</li>
          <li>{t("legend.pan")}</li>
          <li>{t("legend.zoom")}</li>
          <li>{t("legend.doubleClick")}</li>
        </ul>
      </div>
      <div className="debug-toggle">
        <button
          type="button"
          className="debug-toggle-btn"
          onClick={() => setDebugOpen((prev) => !prev)}
          aria-pressed={debugOpen}
        >
          {debugOpen ? "Debug-HUD ausblenden" : "Debug-HUD anzeigen"}
        </button>
        <span className="debug-hint">Strg/⌘ + Shift + D</span>
      </div>
      {debugOpen && (
        <div className="debug-panel" role="log" aria-live="polite">
          <div className="debug-panel-header">
            <div>
              <div className="debug-title">3D-Debug</div>
              <div className="debug-subtitle">Live-Status & letzte Aktionen</div>
            </div>
            <button
              type="button"
              className="debug-close"
              aria-label="Debug schließen"
              onClick={() => setDebugOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="debug-section">
            <div className="debug-label">Renderer & Performance</div>
            <div className="debug-row">
              <span>FPS / Frame</span>
              <code>
                {rendererStats
                  ? `${rendererStats.fps.toFixed(1)} · ${rendererStats.frameMs.toFixed(2)} ms`
                  : "…"}
              </code>
            </div>
            <div className="debug-row">
              <span>Draws</span>
              <code>
                {rendererStats
                  ? `${rendererStats.drawCalls} calls · ${rendererStats.triangles} tris · ${rendererStats.lines} lines · ${rendererStats.points} pts`
                  : "…"}
              </code>
            </div>
            <div className="debug-row">
              <span>Assets</span>
              <code>
                {rendererStats
                  ? `${rendererStats.geometries} geo · ${rendererStats.textures} tex · ${rendererStats.programs} prog`
                  : "…"}
              </code>
            </div>
            <div className="debug-row">
              <span>DPR</span>
              <code>{`${baseDpr.toFixed(2)} → ${canvasDpr.toFixed(2)} ${fallbackQuality ? "(low)" : ""}`}</code>
            </div>
          </div>
          <div className="debug-section">
            <div className="debug-label">Qualität & Effekte</div>
            <div className="debug-row">
              <span>Fallback</span>
              <code>{fallbackQuality ? "aktiv" : "aus"}</code>
            </div>
            <div className="debug-row">
              <span>PostFX</span>
              <code>
                {postProcessingEnabled
                  ? `Bloom ${bloomActive ? "an" : "aus"} · DoF ${dofActive ? "an" : "aus"}`
                  : "deaktiviert"}
              </code>
            </div>
            <div className="debug-row">
              <span>HDRI</span>
              <code>
                {`${lightingSettings.hdri} · exp ${lightingSettings.exposure.toFixed(2)} · env ${lightingSettings.environmentIntensity.toFixed(2)}`}
              </code>
            </div>
            <div className="debug-row">
              <span>Shadows</span>
              <code>
                {`${shadowMapSize}px map · Contact ${contactShadowSettings.enabled ? "an" : "aus"} (${contactShadowSettings.resolution}px)`}
              </code>
            </div>
          </div>
          <div className="debug-section">
            <div className="debug-label">Kamera</div>
            <div className="debug-row">
              <span>Pos</span>
              <code>{formatVec(currentPose?.position)}</code>
            </div>
            <div className="debug-row">
              <span>Target</span>
              <code>{formatVec(currentPose?.target)}</code>
            </div>
            <div className="debug-row">
              <span>LOD / DPR</span>
              <code>
                {lodScaleValue.toFixed(2)} / {canvasDpr.toFixed(2)} {fallbackQuality ? "(low)" : ""}
              </code>
            </div>
            <div className="debug-row">
              <span>Bewegung</span>
              <code>{isCameraMoving ? "moving" : "idle"}</code>
            </div>
          </div>
          <div className="debug-section">
            <div className="debug-label">Szene</div>
            <div className="debug-row">
              <span>Maße (B/H/T)</span>
              <code>
                {config.width.toFixed(2)} × {config.height.toFixed(2)} × {config.depth.toFixed(2)} m
              </code>
            </div>
            <div className="debug-row">
              <span>Module</span>
              <code>
                Ctr {moduleSummary.countersLegacy}/{moduleSummary.countersDetailed} · Scr {moduleSummary.screensLegacy}/
                {moduleSummary.screensDetailed} · Seats {moduleSummary.seating} · Truss {moduleSummary.truss ? "on" : "off"}
              </code>
            </div>
            <div className="debug-row">
              <span>Collision</span>
              <code>{collisionState === undefined ? "–" : collisionState ? "yes" : "no"}</code>
            </div>
          </div>
          <div className="debug-section">
            <div className="debug-label">Selektion</div>
            <div className="debug-row">
              <span>IDs</span>
              <code>{selectionIds.length > 0 ? selectionIds.join(", ") : "keine"}</code>
            </div>
            <div className="debug-row">
              <span>Typ</span>
              <code>{selectionType ?? "–"}</code>
            </div>
            <div className="debug-row">
              <span>Center</span>
              <code>{formatVec(selectionCenter)}</code>
            </div>
            <div className="debug-row">
              <span>Modus</span>
              <code>{editMode ? "Edit aktiv" : "gesperrt"}</code>
            </div>
          </div>
          <div className="debug-section">
            <div className="debug-label">Events</div>
            <div className="debug-events">
              {debugEvents.length === 0 && <div className="debug-muted">Noch keine Events im aktuellen Lauf.</div>}
              {debugEvents.slice(0, 8).map((evt) => (
                <div key={evt.id} className={`debug-event debug-${evt.level ?? "info"}`}>
                  <div className="debug-event-header">
                    <span className="debug-event-title">{evt.title}</span>
                    <span className="debug-event-time">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {evt.details && <div className="debug-event-details">{evt.details}</div>}
                  {evt.meta && (
                    <pre className="debug-event-meta">{JSON.stringify(evt.meta, null, 2)}</pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

