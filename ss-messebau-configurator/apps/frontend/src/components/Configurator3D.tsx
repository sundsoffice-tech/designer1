// src/components/Configurator3D.tsx
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
import { Canvas, extend, invalidate, useFrame, useThree, type ReactThreeFiber, type ThreeEvent } from "@react-three/fiber";
import {
  CameraControls as DreiCameraControls,
  ContactShadows,
  Detailed,
  Environment,
  Grid,
  Html,
  PerformanceMonitor,
  TransformControls,
} from "@react-three/drei";
import { Bloom, DepthOfField, EffectComposer } from "@react-three/postprocessing";
import {
  Physics,
  RigidBody,
  CuboidCollider,
  type RapierRigidBody,
  type RigidBodyAutoCollider,
  type RigidBodyTypeString,
} from "@react-three/rapier";
import CameraControls from "camera-controls";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import * as THREE from "three";

CameraControls.install({ THREE });
extend({ CameraControls });

type CameraControlsImpl = InstanceType<typeof CameraControls>;

declare module "@react-three/fiber" {
  interface ThreeElements {
    cameraControls: ReactThreeFiber.Object3DNode<CameraControls, typeof CameraControls>;
  }
}

import { DEFAULT_LIGHTING, useConfigStore } from "../store/configStore";
import {
  buildSceneAabbs,
  DEFAULT_CLEARANCE,
  findCollisionForMany,
  makeAabb,
} from "../lib/collision";
import { normalizeCounterPlacement } from "../lib/counters";
import { resolveSeatingGeometry } from "../config/objectDimensions";
import { useCameraStore, type CameraPose } from "../store/cameraStore";
import { useTranslation } from "../i18n";
import { buildContextMenu } from "../contextMenu";
import { useContextMenuStore } from "../contextMenu/store";
import { useSceneInteractionStore } from "../store/sceneInteractionStore";
import { registerSceneCommandAdapter } from "../store/commandRegistry";
import type { ChairConfig, CounterConfig, ScreenConfig } from "../lib/pricing";
type WallSide = "back" | "left" | "right";
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
/** EditÔÇæModus Toggle (Taste 'E') */
function useEditModeHotkey(): boolean {
  const [edit, setEdit] = useState<boolean>(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "e") setEdit((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
      const k = e.key.toLowerCase();
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
  if (key === "cabin") return "cabin";
  if (key === "truss") return "truss";
  return "object";
};
const snapValue = (value: number, step = 0.1) => Math.round(value / step) * step;
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
}: {
  w?: number;
  h?: number;
  t?: number;
  materialize?: (base: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterialParameters;
}) {
  const lodScale = useCameraStore((s) => s.lodScale);
  const materializeProps =
    materialize ?? ((base: THREE.MeshStandardMaterialParameters) => base);
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
  children,
  physics,
  onChange,
  onDragStart,
  onDragEnd,
}: {
  enabled: boolean;
  mode: "translate" | "rotate" | "scale";
  snap: boolean;
  children: ReactNode;
  physics?: TransformablePhysics;
  onChange?: (pos: THREE.Vector3) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const tcRef = useRef<TransformControlsImpl | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const rigidRef = useRef<RapierRigidBody | null>(null);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const invalidateFrame = useThree((state) => state.invalidate);
  useAutoDispose(groupRef as MutableRefObject<THREE.Object3D | null>);
  const [collisionFlash, setCollisionFlash] = useState<boolean>(false);
  const collisionTimerRef = useRef<number | null>(null);
  const syncRigidBodyFromObject = useCallback(
    (target?: THREE.Object3D | null) => {
      if (!physics?.enabled) return;
      const body = rigidRef.current;
      const source =
        target ??
        (tcRef.current?.object as THREE.Object3D | undefined) ??
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
      const target = (tcRef.current?.object as THREE.Object3D | undefined) ?? groupRef.current;
      if (!target) return;
      onChange?.(target.position);
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
      onCollisionEnter={() => handleCollisionChange(true)}
      onCollisionExit={() => handleCollisionChange(false)}
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
      translationSnap={snap ? 0.1 : 0}
      rotationSnap={snap ? THREE.MathUtils.degToRad(15) : 0}
      scaleSnap={snap ? 0.1 : 0}
    >
      {wrapped}
    </TransformControls>
  );
}
function StandMesh({
  orbitRef,
  lighting: lightingOverride,
  onFrameAll,
  onDebugEvent,
}: {
  orbitRef: MutableRefObject<CameraControlsImpl | null>;
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
  const editMode = useEditModeHotkey();
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
    wallsClosedSides,
    storageRoom,
    storageDoorSide,
    ledFrames,
    ledWall,
    counters,
    countersWall,
    countersWithPower,
    screens,
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
  const collisionClearance: number = Math.max(
    0,
    typeof modules.collisionClearance === "number" ? modules.collisionClearance : DEFAULT_CLEARANCE
  );
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
  const trussHeight = Math.max(
    defaultTrussHeight,
    typeof modules.trussHeight === "number" ? modules.trussHeight : defaultTrussHeight
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
  /** Wand-Oberfl+ñchen (system | wood | banner | seg | led) */
  type Surface = "system" | "wood" | "banner" | "seg" | "led";
  const wallsDetail = (modules.wallsDetail ?? {}) as Record<WallSide, { surface?: Surface; height?: number }>;
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
  const screensDetailed = useMemo(
    () => (modules.detailedScreens ?? []) as DetailedScreen[],
    [modules.detailedScreens]
  );
  const chairsDetailed = useMemo(
    () => (modules.chairsDetailed ?? []) as ChairConfig[],
    [modules.chairsDetailed]
  );
  const sceneAabbs = useMemo(
    () => buildSceneAabbs(config, collisionClearance),
    [config, collisionClearance]
  );
  const [collidingKeys, setCollidingKeys] = useState<Set<string>>(new Set());
  const lastValidPositions = useRef<Record<string, { x: number; z: number }>>({});
  const rememberValidPosition = useCallback((key: string, pos: { x: number; z: number }) => {
    lastValidPositions.current = { ...lastValidPositions.current, [key]: pos };
  }, []);
  const getFallbackPosition = useCallback(
    (key: string, fallback: { x: number; z: number }) => lastValidPositions.current[key] ?? fallback,
    []
  );
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
  const ensureNoCollision = useCallback(
    (key: string, boxes: ReturnType<typeof makeAabb>[], ignoreIds: string[] = []) => {
      const ignored = new Set<string>([key, ...ignoreIds]);
      const collision = findCollisionForMany(boxes, sceneAabbs, ignored);
      if (collision.collided) {
        setCollisionState(key, true);
        return collision;
      }
      setCollisionState(key, false);
      return collision;
    },
    [sceneAabbs, setCollisionState]
  );

  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [draggedSize, setDraggedSize] = useState<{ w: number; d: number } | null>(null);

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
      return null;
    },
    [cabinPosX, cabinPosZ, chairsDetailed, countersDetailed, screensDetailed, trussOffsetX, trussOffsetZ]
  );

  const startDrag = useCallback(
    (key: string, size: { w: number; d: number }) => {
      setDraggedKey(key);
      setDraggedSize(size);
      disableOrbit();
    },
    [disableOrbit]
  );

  const endDrag = useCallback(() => {
    setDraggedKey(null);
    setDraggedSize(null);
    enableOrbit();
  }, [enableOrbit]);

  const placementHint = useMemo(() => {
    if (!draggedKey || !draggedSize) return null;
    const pos = resolvePositionForKey(draggedKey);
    if (!pos) return null;
    const halfW = draggedSize.w / 2 + collisionClearance;
    const halfD = draggedSize.d / 2 + collisionClearance;
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
    collisionClearance,
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
    trussEnabled,
    trussOffsetX,
    trussOffsetZ,
  ]);
  const handleGroundContextMenu = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      event.preventDefault();
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
      event.preventDefault();
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
        const variant: CounterVariant = ctr.variant ?? (modules.counterVariant ?? "basic");
        const w = ctr.size?.w ?? (variant === "premium" ? 1.4 : 0.9);
        const d = ctr.size?.d ?? (variant === "premium" ? 0.6 : 0.5);
        const baseX = ctr.position?.x ?? 0;
        const baseZ = ctr.position?.z ?? 0;
        const offset = clampXZ(baseX + 0.25, baseZ + 0.25, width, depth, w / 2, d / 2);
        const nextId = `${ctr.id}-copy-${Date.now()}`;
        const next = [...countersDetailed, { ...ctr, id: nextId, position: { x: offset.x, z: offset.z } }];
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
      return false;
    },
    [
      backWallFrontZ,
      chairsDetailed,
      countersDetailed,
      depth,
      leftWallInnerX,
      modules.counterVariant,
      onDebugEvent,
      rightWallInnerX,
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
      return false;
    },
    [chairsDetailed, countersDetailed, screensDetailed, setConfig]
  );
  const snapSelectionByKey = useCallback(
    (key?: string | null) => {
      if (!key) return false;
      if (key.startsWith("ctr-d-")) {
        const id = key.replace("ctr-d-", "");
        const ctr = countersDetailed.find((c) => c.id === id);
        if (!ctr) return false;
        const variant: CounterVariant = ctr.variant ?? (modules.counterVariant ?? "basic");
        const w = ctr.size?.w ?? (variant === "premium" ? 1.4 : 0.9);
        const d = ctr.size?.d ?? (variant === "premium" ? 0.6 : 0.5);
        const pos = ctr.position ?? { x: 0, z: 0 };
        const snapped = clampXZ(snapValue(pos.x), snapValue(pos.z), width, depth, w / 2, d / 2);
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
        const snapped = clampXZ(snapValue(pos.x), snapValue(pos.z), width, depth, w / 2, t / 2);
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
        const snapped = clampXZ(snapValue(pos.x), snapValue(pos.z), width, depth, dims.w / 2, dims.d / 2);
        const next = chairsDetailed.map((s, idx) => {
          const currentId = s.id ?? `${idx}`;
          if (currentId !== id) return s;
          return { ...s, position: { x: snapped.x, z: snapped.z } };
        });
        setConfig({ modules: { chairsDetailed: next } });
        return true;
      }
      return false;
    },
    [chairsDetailed, countersDetailed, depth, modules.counterVariant, screensDetailed, setConfig, width]
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
    if (cabinEnabled) return "cabin";
    if (trussEnabled) return "truss";
    return null;
  }, [cabinEnabled, chairsDetailed, countersDetailed, screensDetailed, trussEnabled]);
  useEffect(() => {
    const handleFrameShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f") return;
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
    // validSelectedKey included to re-evaluate frame shortcut target when selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameSelection, onFrameAll, validSelectedKey]);
  const clearSelectionState = useCallback(
    (removedKey?: string) => {
      setSelectedKey(null);
      closeContextMenu();
      if (removedKey) {
        setCollidingKeys((prev) => {
          if (!prev.has(removedKey)) return prev;
          const next = new Set(prev);
          next.delete(removedKey);
          return next;
        });
      }
    },
    [closeContextMenu, setCollidingKeys]
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
      screensDetailed,
      selectedKey,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clearInteractionSelection,
    deleteSelection,
    duplicateSelectionByKey,
    firstSelectableKey,
    frameSelection,
    resetTransformByKey,
    selectionCenterOf,
    setInteractionSelection,
    setInteractionSelectionCenter,
    setSelectedKey,
    snapSelectionByKey,
    validSelectedKey,
  ]);
  useEffect(() => {
    if (validSelectedKey) {
      setInteractionSelection([validSelectedKey], { selectionType: selectionTypeFromKey(validSelectedKey) });
    } else {
      clearInteractionSelection();
    }
    // validSelectedKey intentionally included to keep selection state in sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearInteractionSelection, setInteractionSelection, validSelectedKey]);
  useEffect(() => {
    if (validSelectedKey) {
      const center = selectionCenterOf(validSelectedKey);
      if (center) {
        setInteractionSelectionCenter(center);
        return;
      }
    }
    setInteractionSelectionCenter(undefined);
    // validSelectedKey intentionally included to keep selection center updated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionCenterOf, setInteractionSelectionCenter, validSelectedKey]);
  // ---- Render
  return (
    <group
      position={[0, 0, 0]}
      // Klick ins Leere / auf Grundfl+ñche: Selektion aufheben
      onPointerMissed={() => setSelectedKey(null)}
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
            <strong>Edit</strong> (E) -À Mode: <strong>{transformMode}</strong> (T/R/S) -À Snap: <strong>{snapOn ? "0,1 m" : "aus"}</strong> (G) -À ESC: Deselektieren
          </div>
        </Html>
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
              >
                <planeGeometry args={[placementHint.halfW * 2, placementHint.halfD * 2]} />
                <meshBasicMaterial color={areaColor} transparent opacity={0.2} />
              </mesh>
              <mesh
                position={[placementHint.pos.x, floorHeight + 0.003, placementHint.pos.z]}
                rotation-x={-Math.PI / 2}
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
            <meshStandardMaterial {...wallMaterialProps(surfaceOf("back"))} />
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
            <meshStandardMaterial {...wallMaterialProps(surfaceOf("left"))} />
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
            <meshStandardMaterial {...wallMaterialProps(surfaceOf("right"))} />
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
        return (
          <Transformable
            enabled={editMode && isSelected("cabin")}
            mode={transformMode}
            snap={snapOn}
            physics={{
              enabled: true,
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
            onDragStart={() => startDrag("cabin", { w: cabinWidth, d: cabinDepth })}
            onDragEnd={endDrag}
            onChange={(pos) => {
              const c = clampXZ(pos.x, pos.z, width, depth, cabinWidth / 2, cabinDepth / 2);
              const candidate = makeAabb("cabin", "Kabine", c.x, c.z, cabinWidth, cabinDepth, collisionClearance);
              const collision = ensureNoCollision("cabin", [candidate]);
              if (collision.collided) {
                const fallback = getFallbackPosition("cabin", { x: cabinPosX, z: cabinPosZ });
                pos.set(fallback.x, pos.y, fallback.z);
                return;
              }
              rememberValidPosition("cabin", { x: c.x, z: c.z });
              pos.set(c.x, pos.y, c.z);
              setConfig({
                modules: {
                  cabin: {
                    enabled: cabinEnabled,
                    width: cabinWidth,
                    depth: cabinDepth,
                    height: cabinHeight,
                    position: { x: c.x, z: c.z },
                  },
                },
              });
            }}
          >
            <group
              position={[cabinPosX, cabinCenterY, cabinPosZ]}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                setSelectedKey("cabin");
              }}
              onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                setSelectedKey("cabin");
                void frameBox(cabinBox);
              }}
              onContextMenu={(e: ThreeEvent<MouseEvent>) => openContextMenuForSelection(e, "cabin", "cabin")}
            >
              {(() => {
                const cabinWallThickness = 0.05;
                const wallMaterial = (
                  <meshStandardMaterial
                    {...pbr({ color: "#d1d5db", roughness: 0.9, metalness: 0.05 })}
                  />
                );
                const doorHeight = Math.min(2.1, cabinHeight - 0.2);
                const doorWidth =
                doorSide === "left" || doorSide === "right"
                  ? Math.min(0.9, cabinDepth - 0.2)
                  : Math.min(0.9, cabinWidth - 0.2);
              const headerHeight = Math.max(0.05, cabinHeight - doorHeight);
              const headerY = -cabinHeight / 2 + doorHeight + headerHeight / 2;
              const renderSolidWall = (side: CabinDoorSide) => {
                if (side === "front" || side === "back") {
                  const z = side === "front"
                    ? cabinDepth / 2 - cabinWallThickness / 2
                    : -cabinDepth / 2 + cabinWallThickness / 2;
                  return (
                    <mesh position={[0, 0, z]} castShadow receiveShadow>
                      <boxGeometry args={[cabinWidth, cabinHeight, cabinWallThickness]} />
                      {wallMaterial}
                    </mesh>
                  );
                }
                const x = side === "left"
                  ? -cabinWidth / 2 + cabinWallThickness / 2
                  : cabinWidth / 2 - cabinWallThickness / 2;
                return (
                  <mesh position={[x, 0, 0]} castShadow receiveShadow>
                    <boxGeometry args={[cabinWallThickness, cabinHeight, cabinDepth]} />
                    {wallMaterial}
                  </mesh>
                );
              };
              const renderWallWithDoor = (side: CabinDoorSide) => {
                if (side === "front" || side === "back") {
                  const z = side === "front"
                    ? cabinDepth / 2 - cabinWallThickness / 2
                    : -cabinDepth / 2 + cabinWallThickness / 2;
                  const gap = Math.max(0, (cabinWidth - doorWidth) / 2);
                  return (
                    <>
                      {gap > 0.001 && (
                        <>
                          <mesh position={[-doorWidth / 2 - gap / 2, 0, z]} castShadow receiveShadow>
                            <boxGeometry args={[gap, cabinHeight, cabinWallThickness]} />
                            {wallMaterial}
                          </mesh>
                          <mesh position={[doorWidth / 2 + gap / 2, 0, z]} castShadow receiveShadow>
                            <boxGeometry args={[gap, cabinHeight, cabinWallThickness]} />
                            {wallMaterial}
                          </mesh>
                        </>
                      )}
                      <mesh position={[0, headerY, z]} castShadow receiveShadow>
                        <boxGeometry args={[doorWidth, headerHeight, cabinWallThickness]} />
                        {wallMaterial}
                      </mesh>
                    </>
                  );
                }
                const x = side === "left"
                  ? -cabinWidth / 2 + cabinWallThickness / 2
                  : cabinWidth / 2 - cabinWallThickness / 2;
                const gap = Math.max(0, (cabinDepth - doorWidth) / 2);
                return (
                  <>
                    {gap > 0.001 && (
                      <>
                        <mesh position={[x, 0, -doorWidth / 2 - gap / 2]} castShadow receiveShadow>
                          <boxGeometry args={[cabinWallThickness, cabinHeight, gap]} />
                          {wallMaterial}
                        </mesh>
                        <mesh position={[x, 0, doorWidth / 2 + gap / 2]} castShadow receiveShadow>
                          <boxGeometry args={[cabinWallThickness, cabinHeight, gap]} />
                          {wallMaterial}
                        </mesh>
                      </>
                    )}
                    <mesh position={[x, headerY, 0]} castShadow receiveShadow>
                      <boxGeometry args={[cabinWallThickness, headerHeight, doorWidth]} />
                      {wallMaterial}
                    </mesh>
                  </>
                );
              };
              return (
                <>
                  {doorSide === "front" ? renderWallWithDoor("front") : renderSolidWall("front")}
                  {doorSide === "back" ? renderWallWithDoor("back") : renderSolidWall("back")}
                  {doorSide === "left" ? renderWallWithDoor("left") : renderSolidWall("left")}
                  {doorSide === "right" ? renderWallWithDoor("right") : renderSolidWall("right")}
                </>
              );
            })()}
            {(() => {
              const cabinWallThickness = 0.05;
              const doorThickness = 0.04;
              const doorHeight = Math.min(2.1, cabinHeight - 0.2);
              const doorWidth =
                doorSide === "left" || doorSide === "right"
                  ? Math.min(0.9, cabinDepth - 0.2)
                  : Math.min(0.9, cabinWidth - 0.2);
              const doorYLocal = -cabinHeight / 2 + doorHeight / 2;
              const handleOffset = Math.max(0.12, doorWidth * 0.35);
              let doorPos: [number, number, number] = [
                0,
                doorYLocal,
                cabinDepth / 2 - cabinWallThickness - doorThickness / 2,
              ];
              let doorRotationY = 0;
              let handlePos: [number, number, number] = [handleOffset, 0, -doorThickness / 2];
              switch (doorSide) {
                case "back":
                  doorPos = [0, doorYLocal, -cabinDepth / 2 + cabinWallThickness + doorThickness / 2];
                  handlePos = [handleOffset, 0, doorThickness / 2];
                  break;
                case "left":
                  doorPos = [
                    -cabinWidth / 2 + cabinWallThickness + doorThickness / 2,
                    doorYLocal,
                    0,
                  ];
                  doorRotationY = Math.PI / 2;
                  break;
                case "right":
                  doorPos = [
                    cabinWidth / 2 - cabinWallThickness - doorThickness / 2,
                    doorYLocal,
                    0,
                  ];
                  doorRotationY = -Math.PI / 2;
                  break;
                default:
                  break;
              }
              return (
                <group position={doorPos} rotation-y={doorRotationY}>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[doorWidth, doorHeight, doorThickness]} />
                    <meshStandardMaterial
                      {...pbr({ color: "#0f172a", roughness: 0.35, metalness: 0.12 })}
                    />
                  </mesh>
                  <mesh position={[handlePos[0], 0, handlePos[2]]}>
                    <boxGeometry args={[0.08, 0.02, 0.02]} />
                    <meshStandardMaterial
                      {...pbr({ color: "#fbbf24", metalness: 0.5, roughness: 0.4 })}
                    />
                  </mesh>
                </group>
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
                      cabinWidth + collisionClearance * 2,
                      cabinHeight,
                      cabinDepth + collisionClearance * 2,
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
            const variant: CounterVariant = ctr.variant ?? (modules.counterVariant ?? "basic");
            const w = ctr.size?.w ?? (variant === "premium" ? 1.4 : 0.9);
            const d = ctr.size?.d ?? (variant === "premium" ? 0.6 : 0.5);
            const h = ctr.size?.h ?? 1.1;
            const px = ctr.position?.x ?? 0;
            const pz = ctr.position?.z ?? 0;
            const key = `ctr-d-${ctr.id}`;
            const selected = isSelected(key);
            const counterBox = registerBounds(
              key,
              new THREE.Box3(
                new THREE.Vector3(px - w / 2, floorHeight, pz - d / 2),
                new THREE.Vector3(px + w / 2, floorHeight + h, pz + d / 2)
              )
            );
            return (
              <Transformable
                key={key}
                enabled={editMode && selected}
                mode={transformMode}
                snap={snapOn}

                physics={{
                  enabled: true,
                  type: "dynamic",
                  colliders: false,
                  childrenColliders: <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />,
                  mass: Math.max(8, w * d * 6),
                  restitution: 0.12,
                  friction: 0.95,
                  linearDamping: 4.2,
                  angularDamping: 7,
                  gravityScale: 1,
                  enabledTranslations: [true, false, true],
                  enabledRotations: [false, true, false],
                  impactRadius: Math.max(w, d) * 0.65,
                  onCollisionChange: (state) => setCollisionState(key, state),
                }}

                onDragStart={() => startDrag(key, { w, d })}
                onDragEnd={endDrag}
                onChange={(pos) => {
                  const c = clampXZ(pos.x, pos.z, width, depth, w / 2, d / 2);
                  const candidate = makeAabb(key, "Counter", c.x, c.z, w, d, collisionClearance);
                  const collision = ensureNoCollision(key, [candidate]);
                  if (collision.collided) {
                    const fallback = getFallbackPosition(key, { x: px, z: pz });
                    pos.set(fallback.x, floorHeight, fallback.z);
                    return;
                  }
                  rememberValidPosition(key, { x: c.x, z: c.z });
                  pos.set(c.x, floorHeight, c.z);
                  const next = countersDetailed.map((c0) =>
                    c0.id === ctr.id ? { ...c0, position: { ...c0.position, x: c.x, z: c.z } } : c0
                  );
                  setConfig({ modules: { countersDetailed: next } });
                }}
                >
                  <group
                    position={[px, floorHeight, pz]}
                    rotation-y={ctr.rotationY ?? 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(key);
                  }}
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
                      <boxGeometry args={[w, h, d]} />
                      <meshBasicMaterial wireframe color="#10b981" />
                    </mesh>
                  )}
                  {collidingKeys.has(key) && (
                    <>
                      <mesh>
                        <boxGeometry
                          args={[w + collisionClearance * 2, h + 0.05, d + collisionClearance * 2]}
                        />
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
              enabled={editMode && selected}
              mode={transformMode}
              snap={snapOn}
              physics={{
                enabled: true,
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
              onDragStart={() => startDrag(key, { w: dims.w, d: dims.d })}
              onDragEnd={endDrag}
              onChange={(pos) => {
                const c = clampXZ(pos.x, pos.z, width, depth, dims.w / 2, dims.d / 2);
                const candidate = makeAabb(key, "Sitzmoebel", c.x, c.z, dims.w, dims.d, collisionClearance);
                const collision = ensureNoCollision(key, [candidate]);
                if (collision.collided) {
                  const fallback = getFallbackPosition(key, { x: px, z: pz });
                  pos.set(fallback.x, floorHeight, fallback.z);
                  return;
                }
                rememberValidPosition(key, { x: c.x, z: c.z });
                pos.set(c.x, floorHeight, c.z);
                const next = chairsDetailed.map((c0, cIdx) => {
                  const currentId = c0.id ?? `${cIdx}`;
                  if (currentId !== seatId) return c0;
                  return { ...c0, position: { ...c0.position, x: c.x, z: c.z } };
                });
                setConfig({ modules: { chairsDetailed: next } });
              }}
            >
              <group
                position={[px, floorHeight, pz]}
                rotation-y={rotY}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(key);
                }}
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
                        args={[dims.w + collisionClearance * 2, overlayHeight, dims.d + collisionClearance * 2]}
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
        }[] = [];
        rawFrames.forEach((frame, idx) => {
          const count = Math.max(1, Number(frame.count) || 1);
          for (let i = 0; i < count; i++) {
            expanded.push({
              ...frame,
              id: frame.id ?? `led-${idx}-${i}`,
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
            return { ...frame, id: resolvedId, targetWall, floating };
          })
          .filter(
            (frame): frame is NonNullable<typeof frame> & { targetWall: WallSide; floating: boolean } =>
              Boolean(frame?.targetWall)
          );
        const byWall: Record<WallSide, typeof prepared> = { back: [], left: [], right: [] };
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
                key={frame.id ?? `${side}-led-${idx}`}
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
            const dragSize =
              mount === "wall" && (side === "left" || side === "right")
                ? { w: t, d: w }
                : { w, d: t };
            const translationMask: [boolean, boolean, boolean] =
              mount === "wall"
                ? side === "back"
                  ? [true, false, false]
                  : [false, false, true]
                : [true, false, true];
            const boundW = mount === "wall" && (side === "left" || side === "right") ? t : w;
            const boundD = mount === "wall" && (side === "left" || side === "right") ? w : t;
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
                enabled={editMode && selected}
                mode={transformMode}
                snap={snapOn}
                physics={{
                  enabled: true,
                  type: "dynamic",
                  colliders: false,
                  childrenColliders: (
                    <CuboidCollider
                      args={
                        mount === "wall"
                          ? side === "left" || side === "right"
                            ? [Math.max(t, 0.05) / 2, h / 2, w / 2]
                            : [w / 2, h / 2, Math.max(t, 0.05) / 2]
                          : [w / 2, Math.max(h, 0.4) / 2, Math.max(t, 0.08) / 2]
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

                  const candidateCenterX = nextX;
                  const candidateCenterZ = nextZ;
                  let candidateW = w;
                  let candidateD = t;
                  if (mount === "wall") {
                    if (side === "left" || side === "right") {
                      candidateW = t;
                      candidateD = w;
                    }
                  }
                  const candidate = makeAabb(
                    key,
                    "Screen",
                    candidateCenterX,
                    candidateCenterZ,
                    candidateW,
                    candidateD,
                    collisionClearance
                  );
                  const collision = ensureNoCollision(key, [candidate]);
                  if (collision.collided) {
                    const fallback = getFallbackPosition(key, { x: px, z: pz });
                    pos.set(fallback.x, floorHeight + y, fallback.z);
                    return;
                  }
                  rememberValidPosition(key, { x: candidateCenterX, z: candidateCenterZ });
                  pos.set(candidateCenterX, floorHeight + y, candidateCenterZ);
                  const next = screensDetailed.map((s0) =>
                    s0.id === scr.id
                      ? { ...s0, position: { x: candidateCenterX, z: candidateCenterZ }, wallSide: side ?? s0.wallSide }
                      : s0
                  );
                  setConfig({ modules: { detailedScreens: next } });
                }}
              >
                <group
                  position={[px, floorHeight + y, pz]}
                  rotation-y={rotY}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(key);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(key);
                  void frameBox(screenBox);
                }}
                onContextMenu={(e) => openContextMenuForSelection(e, key, "screen")}
              >
                  <ScreenPanel w={w} h={h} t={t} materialize={pbr} />
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
      {trussEnabled && (
        <group position={[trussOffsetX, 0, trussOffsetZ]}>
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
            onDragStart={() => startDrag("truss", { w: width, d: depth })}
            onDragEnd={endDrag}
            onChange={(pos) => {
              const c = clampXZ(pos.x, pos.z, width, depth, 0.4, 0.4);
              const columnSize = 0.12;
              const candidates = [
                makeAabb(
                  "truss-col-front-left",
                  "Truss-St++tze",
                  -width / 2 + c.x,
                  depth / 2 + c.z,
                  columnSize,
                  columnSize,
                  collisionClearance
                ),
                makeAabb(
                  "truss-col-front-right",
                  "Truss-St++tze",
                  width / 2 + c.x,
                  depth / 2 + c.z,
                  columnSize,
                  columnSize,
                  collisionClearance
                ),
                makeAabb(
                  "truss-col-back-left",
                  "Truss-St++tze",
                  -width / 2 + c.x,
                  -depth / 2 + c.z,
                  columnSize,
                  columnSize,
                  collisionClearance
                ),
                makeAabb(
                  "truss-col-back-right",
                  "Truss-St++tze",
                  width / 2 + c.x,
                  -depth / 2 + c.z,
                  columnSize,
                  columnSize,
                  collisionClearance
                ),
              ];
              const ignoreSelf = [
                "truss-col-front-left",
                "truss-col-front-right",
                "truss-col-back-left",
                "truss-col-back-right",
              ];
              const collision = ensureNoCollision("truss", candidates, ignoreSelf);
              if (collision.collided) {
                const fallback = getFallbackPosition("truss", { x: trussOffsetX, z: trussOffsetZ });
                pos.set(fallback.x, pos.y, fallback.z);
                return;
              }
              rememberValidPosition("truss", { x: c.x, z: c.z });
              pos.set(c.x, pos.y, c.z);
              setConfig({ modules: { trussOffset: { x: c.x, z: c.z } } });
            }}
          >
            <group
              position={[0, trussHeight, 0]}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedKey("truss");
              }}
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
          {(() => {
            const trussLodDistances = [8, 16].map((d) => d * lodScale);
            const columnSize = 0.12;
            const columnHeight = Math.max(0.1, trussHeight - floorHeight);
            const columnY = floorHeight + columnHeight / 2;
            const frameThickness = 0.08;
            const frameLengthX = Math.max(0.1, width - columnSize);
            const frameLengthZ = Math.max(0.1, depth - columnSize);
            const columnPositions: [number, number, number][] = [
              [-width / 2, columnY, depth / 2],
              [width / 2, columnY, depth / 2],
              [-width / 2, columnY, -depth / 2],
              [width / 2, columnY, -depth / 2],
            ];
            const highColumns = columnPositions.map((pos, idx) => (
              <mesh key={`truss-col-high-${idx}`} position={pos} castShadow>
                <boxGeometry args={[columnSize, columnHeight, columnSize]} />
                <meshStandardMaterial
                  {...pbr({ color: "#9ca3af", metalness: 0.8, roughness: 0.32, envMapIntensity })}
                />
              </mesh>
            ));
            const mediumColumns = columnPositions.map((pos, idx) => (
              <mesh key={`truss-col-medium-${idx}`} position={pos} castShadow={false}>
                <boxGeometry args={[columnSize * 0.95, columnHeight, columnSize * 0.95]} />
                <meshStandardMaterial
                  {...pbr({ color: "#a3a3a3", metalness: 0.65, roughness: 0.4, envMapIntensity })}
                />
              </mesh>
            ));
            const frameHighDetail = (
              <>
                {highColumns}
                <mesh position={[0, trussHeight, depth / 2]} castShadow>
                  <boxGeometry args={[frameLengthX, frameThickness, frameThickness]} />
                  <meshStandardMaterial
                    {...pbr({
                      color: "#9ca3af",
                      metalness: 0.8,
                      roughness: 0.3,
                      envMapIntensity,
                    })}
                  />
                </mesh>
                <mesh position={[0, trussHeight, -depth / 2]} castShadow>
                  <boxGeometry args={[frameLengthX, frameThickness, frameThickness]} />
                  <meshStandardMaterial
                    {...pbr({
                      color: "#9ca3af",
                      metalness: 0.8,
                      roughness: 0.3,
                      envMapIntensity,
                    })}
                  />
                </mesh>
                <mesh position={[-width / 2, trussHeight, 0]} castShadow>
                  <boxGeometry args={[frameThickness, frameThickness, frameLengthZ]} />
                  <meshStandardMaterial
                    {...pbr({
                      color: "#9ca3af",
                      metalness: 0.8,
                      roughness: 0.3,
                      envMapIntensity,
                    })}
                  />
                </mesh>
                <mesh position={[width / 2, trussHeight, 0]} castShadow>
                  <boxGeometry args={[frameThickness, frameThickness, frameLengthZ]} />
                  <meshStandardMaterial
                    {...pbr({
                      color: "#9ca3af",
                      metalness: 0.8,
                      roughness: 0.3,
                      envMapIntensity,
                    })}
                  />
                </mesh>
              </>
            );
            const frameMediumDetail = (
              <>
                {mediumColumns}
                <mesh position={[0, trussHeight, depth / 2]} castShadow={false}>
                  <boxGeometry args={[frameLengthX, frameThickness * 1.125, frameThickness * 1.125]} />
                  <meshStandardMaterial
                    {...pbr({
                      color: "#a3a3a3",
                      metalness: 0.65,
                      roughness: 0.4,
                      envMapIntensity,
                    })}
                  />
                </mesh>
                <mesh position={[0, trussHeight, -depth / 2]} castShadow={false}>
                  <boxGeometry args={[frameLengthX, frameThickness * 1.125, frameThickness * 1.125]} />
                  <meshStandardMaterial
                    {...pbr({
                      color: "#a3a3a3",
                      metalness: 0.65,
                      roughness: 0.4,
                      envMapIntensity,
                    })}
                  />
                </mesh>
                <mesh position={[-width / 2, trussHeight, 0]} castShadow={false}>
                  <boxGeometry args={[frameThickness * 1.125, frameThickness * 1.125, frameLengthZ]} />
                  <meshStandardMaterial
                    {...pbr({
                      color: "#a3a3a3",
                      metalness: 0.65,
                      roughness: 0.4,
                      envMapIntensity,
                    })}
                  />
                </mesh>
                <mesh position={[width / 2, trussHeight, 0]} castShadow={false}>
                  <boxGeometry args={[frameThickness * 1.125, frameThickness * 1.125, frameLengthZ]} />
                  <meshStandardMaterial
                    {...pbr({
                      color: "#a3a3a3",
                      metalness: 0.65,
                      roughness: 0.4,
                      envMapIntensity,
                    })}
                  />
                </mesh>
              </>
            );
            const frameLowDetail = (
              <>
                {columnPositions.map((pos, idx) => (
                  <mesh key={`truss-col-low-${idx}`} position={pos} castShadow>
                    <boxGeometry args={[columnSize, columnHeight, columnSize]} />
                    <meshStandardMaterial
                      {...pbr({ color: "#9ca3af", metalness: 0.6, roughness: 0.4, envMapIntensity: envMapIntensity * 0.8 })}
                    />
                  </mesh>
                ))}
                <mesh position={[0, trussHeight, 0]} castShadow>
                  <boxGeometry args={[frameLengthX + frameThickness, frameThickness * 1.2, frameLengthZ + frameThickness]} />
                  <meshStandardMaterial
                    {...pbr({ color: "#9ca3af", metalness: 0.6, roughness: 0.35, envMapIntensity: envMapIntensity * 0.8 })}
                  />
                </mesh>
              </>
            );

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
              <>
                <Detailed distances={trussLodDistances}>
                  <group>{frameHighDetail}</group>
                  <group>{frameMediumDetail}</group>
                  {frameLowDetail}
                </Detailed>
                {trussLights.length > 0 && (
                  <Detailed distances={trussLodDistances}>
                    <group>{lightsHigh}</group>
                    <group>{lightsMedium}</group>
                    <group>{lightsLow}</group>
                  </Detailed>
                )}
              </>
            );
          })()}
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
      )}
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
    const trussCeiling = config.modules.truss ? (config.modules.trussHeight ?? config.height + 0.5) + 1 : 0;
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
        clearAction(action.id);
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

    const prev = lastPoseRef.current;
    const changed =
      !prev ||
      Math.abs(prev.position[0] - pose.position[0]) > 1e-3 ||
      Math.abs(prev.position[1] - pose.position[1]) > 1e-3 ||
      Math.abs(prev.position[2] - pose.position[2]) > 1e-3 ||
      Math.abs(prev.target[0] - pose.target[0]) > 1e-3 ||
      Math.abs(prev.target[1] - pose.target[1]) > 1e-3 ||
      Math.abs(prev.target[2] - pose.target[2]) > 1e-3;

    if (changed) {
      lastPoseRef.current = pose;
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


export default function Configurator3D() {
  const [debugOpen, setDebugOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("debug3d");
  });
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
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
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setDebugOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!debugOpen) return;
    logDebugEvent({ title: "Debug HUD opened", details: "Capturing 3D diagnostics" });
  }, [debugOpen, logDebugEvent]);
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
  const config = useConfigStore((s) => s.config);
  const modules = config.modules;
  const queueAction = useCameraStore((s) => s.queueAction);
  const currentPose = useCameraStore((s) => s.currentPose);
  const lodScaleValue = useCameraStore((s) => s.lodScale);
  const selectionIds = useSceneInteractionStore((s) => s.selectionIds);
  const selectionType = useSceneInteractionStore((s) => s.selectionType);
  const selectionCenter = useSceneInteractionStore((s) => s.selectionCenter);
  const collisionState = useSceneInteractionStore((s) => s.collision);
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
    const trussCeiling = config.modules.truss ? (config.modules.trussHeight ?? config.height + 0.5) + 1 : 0;
    const maxSceneHeight = Math.max(config.height + floorHeight + 2, trussCeiling);
    const baseBox = new THREE.Box3(
      new THREE.Vector3(-config.width / 2, 0, -config.depth / 2),
      new THREE.Vector3(config.width / 2, maxSceneHeight, config.depth / 2)
    );
    const padding = Math.max(config.width, config.depth) * 0.1 + 0.8;
    const padded = baseBox.clone().expandByScalar(padding);
    controls.stop();
    void controls.fitToBox(padded, true);
  }, [config.depth, config.height, config.modules.truss, config.modules.trussHeight, config.width, floorHeight, orbitRef]);

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
      { id: "front", label: t("camera.quick.front"), pose: { position: [0, flyHeight, config.depth / 2 + orbitPadding], target: center } },
      { id: "top", label: t("camera.quick.top"), pose: { position: [0, flyHeight + orbitPadding * 0.45, 0.001], target: center } },
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
        cellSize={0.5}
        sectionSize={2}
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
          {/* SSAO intentionally omitted unless a NormalPass gets added; see three.js examples if reintroducing. */}
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
        onDoubleClick={(event) => {
          if (event.intersections.length === 0) {
            frameAll();
          }
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
