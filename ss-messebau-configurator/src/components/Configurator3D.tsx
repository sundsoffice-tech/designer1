// src/components/Configurator3D.tsx
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  Grid,
  useTexture,
  TransformControls,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import { useConfigStore } from "../store/configStore";

type WallSide = "back" | "left" | "right";
type CounterVariant = "basic" | "premium" | "corner";

/** Detaillierte, frei platzierbare Objekte (optionale Felder im Store) */
type DetailedCounter = {
  id: string;
  variant?: CounterVariant;
  size?: { w: number; d: number; h?: number };
  withPower?: boolean;
  position: { x: number; z: number; y?: number };
  rotationY?: number;
};

type DetailedScreen = {
  id: string;
  size?: { w: number; h: number; t?: number };
  mount?: "wall" | "truss" | "floor";
  wallSide?: WallSide;
  heightFromFloor?: number;
  position: { x: number; z: number };
  rotationY?: number;
};

type CabinWithPosition = {
  enabled: boolean;
  width: number;
  depth: number;
  height: number;
  doorSide: "front" | "left" | "right" | "back";
  position?: { x?: number; z?: number };
};

/** Edit‑Modus Toggle (Taste 'E') */
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

/** Transform‑Modus & Snap Shortcuts (T/R/S/G/Esc) */
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

/** clamp X/Z in Standfläche, optional mit halben Abmessungen eines Objekts */
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

/** Geometrien */
function CounterBlock({
  variant,
  w = 0.9,
  d = 0.5,
  h = 1.1,
}: {
  variant: CounterVariant;
  w?: number;
  d?: number;
  h?: number;
}) {
  if (variant === "basic") {
    return (
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.35} metalness={0.45} />
      </mesh>
    );
  }
  if (variant === "premium") {
    return (
      <group>
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[Math.max(w, 1.4), h, Math.max(d, 0.6)]} />
          <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0, h * 0.55, Math.max(d, 0.6) / 2 - 0.29]} castShadow={false}>
          <boxGeometry args={[1.2, 0.5, 0.02]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.2} metalness={0.7} />
        </mesh>
        <mesh position={[0, h + 0.02, 0]}>
          <boxGeometry args={[Math.max(w, 1.45), 0.06, Math.max(d, 0.65)]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.2} metalness={0.3} />
        </mesh>
      </group>
    );
  }
  // corner
  return (
    <group>
      <mesh position={[-w / 2 + w * 0.5, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[0, h / 2, -d / 2 + d * 0.5]} castShadow receiveShadow>
        <boxGeometry args={[d, h, w]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[-0.2, h + 0.02, -0.2]}>
        <boxGeometry args={[1.2, 0.06, 1.2]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.3} metalness={0.3} />
      </mesh>
    </group>
  );
}

function ScreenPanel({ w = 0.9, h = 0.55, t = 0.02 }) {
  return (
    <mesh castShadow>
      <boxGeometry args={[w, h, t]} />
      <meshStandardMaterial color="#020617" roughness={0.2} metalness={0.7} />
    </mesh>
  );
}

/** TransformControls Wrapper: sperrt Orbit während Interaktion */
function Transformable({
  enabled,
  mode,
  snap,
  children,
  onChange,
  onDragStart,
  onDragEnd,
}: {
  enabled: boolean;
  mode: "translate" | "rotate" | "scale";
  snap: boolean;
  children: ReactNode;
  onChange?: (pos: THREE.Vector3) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const tcRef = useRef<any>(null);
  const groupRef = useRef<THREE.Group>(null!);

  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;

    const handleChange = () => onChange?.(groupRef.current.position);
    const handleMouseDown = () => onDragStart?.();
    const handleMouseUp = () => onDragEnd?.();
    const handleDraggingChanged = (e: any) => {
      if (e?.value === true) onDragStart?.();
      else onDragEnd?.();
    };

    tc.addEventListener("objectChange", handleChange);
    tc.addEventListener("mouseDown", handleMouseDown);
    tc.addEventListener("mouseUp", handleMouseUp);
    tc.addEventListener("dragging-changed", handleDraggingChanged);

    return () => {
      tc.removeEventListener("objectChange", handleChange);
      tc.removeEventListener("mouseDown", handleMouseDown);
      tc.removeEventListener("mouseUp", handleMouseUp);
      tc.removeEventListener("dragging-changed", handleDraggingChanged);
    };
  }, [onChange, onDragEnd, onDragStart]);

  if (!enabled) {
    return <group ref={groupRef}>{children}</group>;
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
      <group ref={groupRef}>{children}</group>
    </TransformControls>
  );
}

function StandMesh({ orbitRef }: { orbitRef: MutableRefObject<any> }) {
  const { config, setConfig } = useConfigStore();
  const { width, depth, height, modules } = config;

  // ---- Lokale Edit-/UI-State
  const editMode = useEditModeHotkey();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Transform‑Shortcuts (T/R/S/G/Esc)
  const { mode: transformMode, snap: snapOn } = useTransformKeyboard(setSelectedKey);

  // Orbit sperren / freigeben
  const setOrbitEnabled = (enabled: boolean) => {
    if (orbitRef?.current) orbitRef.current.enabled = enabled;
  };
  const disableOrbit = () => setOrbitEnabled(false);
  const enableOrbit = () => setOrbitEnabled(true);

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
  } = modules as any;

  const mAny = modules as any;
  const cabin = mAny.cabin as CabinWithPosition | undefined;

  // Truss & Licht
  const trussEnabled: boolean = !!mAny.truss;
  const trussLightType: "spot" | "wash" = (mAny.trussLightType ?? "spot") as "spot" | "wash";

  const trussLightsFront: number = mAny.trussLightsFront ?? 0;
  const trussLightsBack: number = mAny.trussLightsBack ?? 0;
  const trussLightsLeft: number = mAny.trussLightsLeft ?? 0;
  const trussLightsRight: number = mAny.trussLightsRight ?? 0;

  const wallLightsBack: number = mAny.wallLightsBack ?? 0;
  const wallLightsLeft: number = mAny.wallLightsLeft ?? 0;
  const wallLightsRight: number = mAny.wallLightsRight ?? 0;

  // Banner / Truss
  const bannersFront: number = mAny.trussBannersFront ?? 0;
  const bannersBack: number = mAny.trussBannersBack ?? 0;
  const bannersLeft: number = mAny.trussBannersLeft ?? 0;
  const bannersRight: number = mAny.trussBannersRight ?? 0;

  const bannerWidth: number = mAny.trussBannerWidth ?? 3;
  const bannerHeight: number = mAny.trussBannerHeight ?? 1;
  const bannerThickness = 0.04;

  // Boden/Standhöhen
  const floorConfig = modules.floor;
  const isRaised = floorConfig?.raised ?? modules.raisedFloor ?? false;
  const floorHeight = isRaised ? 0.08 : 0.025;

  const wallHeight = height;
  const wallCenterY = floorHeight + wallHeight / 2;

  const defaultTrussHeight = floorHeight + wallHeight + 0.5;
  const trussHeight = Math.max(
    defaultTrussHeight,
    typeof mAny.trussHeight === "number" ? mAny.trussHeight : defaultTrussHeight
  );

  const trussOffsetX: number = (mAny.trussOffset?.x ?? 0) as number;
  const trussOffsetZ: number = (mAny.trussOffset?.z ?? 0) as number;

  // useTexture -> Fallback 1x1 PNG (weiß)
  const BLANK_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAosBv2jz2l0AAAAASUVORK5CYII=";
  const bannerImageUrl: string | undefined = mAny.trussBannerImageUrl;
  const bannerTexture = useTexture(bannerImageUrl || BLANK_PNG);

  const scaleX = width;
  const scaleZ = depth;

  // Geometrie-Hilfswerte
  const wallThickness = 0.06;
  const panelGap = 0.01;

  // Innenpositionen der Wand-Frontflächen
  const backWallFrontZ = -depth / 2 + wallThickness + panelGap;
  const leftWallInnerX = -width / 2 + wallThickness + panelGap;
  const rightWallInnerX = width / 2 - wallThickness - panelGap;

  const ledWallSide = (ledWall as WallSide) ?? "back";
  const screensWallSide = (screensWall as WallSide) ?? "back";
  const countersPlacement = (countersWall as "front" | "island") ?? "front";

  // Türseite der Kabine
  const doorSide =
    (cabin?.doorSide as "front" | "left" | "right" | "back") ??
    (storageDoorSide as "front" | "left" | "right" | "back") ??
    "front";

  // Kabine aktiv?
  const cabinEnabled: boolean = !!(cabin && (cabin.enabled ?? storageRoom));

  // Kabinengeometrie + Position (Zentrum)
  const cabinWidth = cabin?.width ?? 1.5;
  const cabinDepth = cabin?.depth ?? 1.5;
  const cabinHeight = cabin?.height ?? wallHeight;
  const cabinPosX = cabin?.position?.x ?? -width / 2 + cabinWidth / 2 + 0.25;
  const cabinPosZ = cabin?.position?.z ?? -depth / 2 + cabinDepth / 2 + 0.25;
  const cabinCenterY = floorHeight + cabinHeight / 2;

  // Boden-Material
  const floorType = floorConfig?.type ?? "carpet";
  const floorMaterial = (() => {
    switch (floorType) {
      case "laminate":
        return { color: "#e5e7eb", roughness: 0.35, metalness: 0.08 } as const;
      case "vinyl":
        return { color: "#0f172a", roughness: 0.3, metalness: 0.15 } as const;
      case "wood":
        return { color: "#92400e", roughness: 0.6, metalness: 0.1 } as const;
      case "carpet":
      default:
        return { color: "#1e293b", roughness: 0.95, metalness: 0.05 } as const;
    }
  })();

  /** Wand-Oberflächen (system | wood | banner | seg | led) */
  type Surface = "system" | "wood" | "banner" | "seg" | "led";
  const wallsDetail = (mAny.wallsDetail ?? {}) as Record<WallSide, { surface?: Surface; height?: number }>;
  const surfaceOf = (side: WallSide): Surface => (wallsDetail[side]?.surface ?? "system") as Surface;
  const wallMaterialProps = (s: Surface) => {
    switch (s) {
      case "wood":
        return { color: "#8B5A2B", roughness: 0.8, metalness: 0.05 } as const;
      case "banner":
        return { color: "#111827", roughness: 0.5, metalness: 0.2 } as const;
      case "seg":
        return { color: "#f3f4f6", roughness: 0.85, metalness: 0.05 } as const;
      case "led":
        return {
          color: "#0f172a",
          roughness: 0.35,
          metalness: 0.15,
          emissive: "#38bdf8",
          emissiveIntensity: 0.9,
        } as const;
      case "system":
      default:
        return { color: "#e5e7eb", roughness: 0.9, metalness: 0.05 } as const;
    }
  };

  // Helper: Truss-Lichtkörper je nach Typ
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
            <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={1.2} roughness={0.4} />
          </mesh>
        ) : (
          <mesh position={[x, y, z]} castShadow>
            <boxGeometry args={[0.14, 0.08, 0.1]} />
            <meshStandardMaterial
              color="#fde68a"
              emissive="#fbbf24"
              emissiveIntensity={0.9}
              roughness={0.35}
              metalness={0.4}
            />
          </mesh>
        )}

        <pointLight position={[lx, ly, lz]} intensity={1.1} distance={6} decay={2} color="#fef3c7" />
      </group>
    );
  };

  // ---- Detaillierte Objekte aus Store (optional)
  const countersDetailed = (mAny.countersDetailed ?? []) as DetailedCounter[];
  const screensDetailed = (mAny.detailedScreens ?? []) as DetailedScreen[];

  // Keyboard-Nudging für selektierte Objekte (WASD / Pfeiltasten)
  useEffect(() => {
    if (!editMode || !selectedKey) return;

    const handleNudge = (dx: number, dz: number) => {
      // Kabine
      if (selectedKey === "cabin" && cabinEnabled && cabin) {
        const next = clampXZ(cabinPosX + dx, cabinPosZ + dz, width, depth, cabinWidth / 2, cabinDepth / 2);
        setConfig({ modules: { cabin: { position: { x: next.x, z: next.z } } } as any });
        return;
      }

      // Truss
      if (selectedKey === "truss" && trussEnabled) {
        const next = clampXZ(trussOffsetX + dx, trussOffsetZ + dz, width, depth, 0.4, 0.4);
        setConfig({ modules: { trussOffset: { x: next.x, z: next.z } } as any });
        return;
      }

      // Counters (detailed)
      if (selectedKey.startsWith("ctr-d-")) {
        const id = selectedKey.replace("ctr-d-", "");
        const c = countersDetailed.find((c0) => c0.id === id);
        if (!c) return;

        const variant: CounterVariant = c.variant ?? (mAny.counterVariant ?? "basic");
        const w = c.size?.w ?? (variant === "premium" ? 1.4 : 0.9);
        const d = c.size?.d ?? (variant === "premium" ? 0.6 : 0.5);
        const px = c.position?.x ?? 0;
        const pz = c.position?.z ?? 0;
        const next = clampXZ(px + dx, pz + dz, width, depth, w / 2, d / 2);

        setConfig({
          modules: {
            countersDetailed: countersDetailed.map((c0) =>
              c0.id === id ? { ...c0, position: { ...c0.position, x: next.x, z: next.z } } : c0
            ),
          } as any,
        });
        return;
      }

      // Screens (detailed)
      if (selectedKey.startsWith("scr-d-")) {
        const id = selectedKey.replace("scr-d-", "");
        const s = screensDetailed.find((s0) => s0.id === id);
        if (!s) return;

        const mount = s.mount ?? "wall";
        const w = s.size?.w ?? 0.9;
        const h = s.size?.h ?? 0.55;
        const t = s.size?.t ?? 0.02;
        let px = s.position?.x ?? 0;
        let pz = s.position?.z ?? 0;

        if (mount === "wall") {
          const side = s.wallSide ?? "back";
          if (side === "back") {
            px += dx;
            const next = clampXZ(px, backWallFrontZ, width, depth, w / 2, 0.001);
            px = next.x;
            pz = backWallFrontZ;
          } else if (side === "left") {
            pz += dz;
            const next = clampXZ(leftWallInnerX, pz, width, depth, 0.001, h / 2);
            px = leftWallInnerX;
            pz = next.z;
          } else {
            pz += dz;
            const next = clampXZ(rightWallInnerX, pz, width, depth, 0.001, h / 2);
            px = rightWallInnerX;
            pz = next.z;
          }
        } else {
          const next = clampXZ(px + dx, pz + dz, width, depth, w / 2, t / 2);
          px = next.x;
          pz = next.z;
        }

        setConfig({
          modules: {
            detailedScreens: screensDetailed.map((s0) =>
              s0.id === id ? { ...s0, position: { x: px, z: pz } } : s0
            ),
          } as any,
        });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const moveKeys = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);
      if (!moveKeys.has(key)) return;

      const fineStep = 0.05;
      const baseStep = 0.15;
      const fastStep = 0.5;
      const step = e.shiftKey ? fastStep : e.altKey ? fineStep : baseStep;

      let dx = 0;
      let dz = 0;
      if (key === "arrowup" || key === "w") dz = -step;
      if (key === "arrowdown" || key === "s") dz = step;
      if (key === "arrowleft" || key === "a") dx = -step;
      if (key === "arrowright" || key === "d") dx = step;

      if (dx !== 0 || dz !== 0) {
        e.preventDefault();
        handleNudge(dx, dz);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    backWallFrontZ,
    cabin,
    cabinDepth,
    cabinEnabled,
    cabinPosX,
    cabinPosZ,
    cabinWidth,
    countersDetailed,
    depth,
    editMode,
    leftWallInnerX,
    mAny.counterVariant,
    rightWallInnerX,
    screensDetailed,
    selectedKey,
    setConfig,
    trussEnabled,
    trussOffsetX,
    trussOffsetZ,
    width,
  ]);

  // ---- Legacy → Detailed Konverter (per Doppelklick)
  const convertLegacyCountersToDetailed = () => {
    if ((counters ?? 0) <= 0) return;
    const count = counters!;
    const out: DetailedCounter[] = Array.from({ length: count }).map((_, idx) => {
      const spacing = width / (count + 1 || 1);
      const xPos = -width / 2 + spacing * (idx + 1);
      const zPos = countersPlacement === "island" ? 0 : depth / 2 - 0.5;
      return {
        id: `ctr-${Date.now()}-${idx}`,
        variant: mAny.counterVariant ?? "basic",
        withPower: !!mAny.countersWithPower,
        position: { x: xPos, z: zPos },
      };
    });
    setConfig({
      modules: {
        countersDetailed: out,
        counters: 0,
      } as any,
    });
  };

  const convertLegacyScreensToDetailed = () => {
    if ((screens ?? 0) <= 0) return;
    const count = screens!;
    const out: DetailedScreen[] = Array.from({ length: count }).map((_, idx) => {
      const total = count || 1;
      let x = 0;
      let z = 0;
      let wall: WallSide = (screensWallSide as WallSide) ?? "back";
      if (wall === "back") {
        const spacing = width / (total + 1);
        x = -width / 2 + spacing * (idx + 1);
        z = backWallFrontZ;
      } else if (wall === "left") {
        const spacing = depth / (total + 1);
        z = -depth / 2 + spacing * (idx + 1);
        x = leftWallInnerX;
      } else {
        const spacing = depth / (total + 1);
        z = -depth / 2 + spacing * (idx + 1);
        x = rightWallInnerX;
      }
      return {
        id: `scr-${Date.now()}-${idx}`,
        size: { w: 0.9, h: 0.55, t: 0.02 },
        mount: "wall",
        wallSide: wall,
        heightFromFloor: floorHeight + 1.6,
        position: { x, z },
        rotationY:
          wall === "left" ? Math.PI / 2 : wall === "right" ? -Math.PI / 2 : 0,
      };
    });
    setConfig({
      modules: {
        detailedScreens: out,
        screens: 0,
      } as any,
    });
  };

  // ---- Selektion / Gültigkeit prüfen (falls Objekt weg ist -> deselect)
  useEffect(() => {
    if (!selectedKey) return;
    const validKeys = new Set<string>();
    if (cabinEnabled) validKeys.add("cabin");
    if (trussEnabled) validKeys.add("truss");
    countersDetailed.forEach((c) => validKeys.add(`ctr-d-${c.id}`));
    screensDetailed.forEach((s) => validKeys.add(`scr-d-${s.id}`));
    if (!validKeys.has(selectedKey)) setSelectedKey(null);
  }, [selectedKey, cabinEnabled, trussEnabled, countersDetailed, screensDetailed]);

  const isSelected = (key: string) => selectedKey === key;

  // ---- Render
  return (
    <group
      position={[0, 0, 0]}
      // Klick ins Leere / auf Grundfläche: Selektion aufheben
      onPointerMissed={() => setSelectedKey(null)}
    >
      {/* Kurze HUD-Hilfe im Edit‑Modus */}
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
            <strong>Edit</strong> (E) · Mode: <strong>{transformMode}</strong> (T/R/S) · Snap: <strong>{snapOn ? "0,1 m" : "aus"}</strong> (G) · ESC: Deselektieren
          </div>
        </Html>
      )}

      {/* Basisplatte (Rand, damit Schatten bleibt) */}
      <mesh
        position={[0, 0.0, 0]}
        rotation-x={-Math.PI / 2}
        receiveShadow
        castShadow={false}
        onClick={() => setSelectedKey(null)}
      >
        <planeGeometry args={[scaleX + 0.4, scaleZ + 0.4]} />
        <meshStandardMaterial color="#020617" metalness={0.2} roughness={0.8} />
      </mesh>

      {/* Doppelboden-Körper */}
      {isRaised && (
        <mesh position={[0, floorHeight / 2, 0]} receiveShadow castShadow>
          <boxGeometry args={[scaleX, floorHeight, scaleZ]} />
          <meshStandardMaterial color="#020617" roughness={0.6} metalness={0.2} />
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

      {/* Wände */}
      {wallsClosedSides >= 1 && (
        <mesh
          position={[0, wallCenterY, -depth / 2 + wallThickness / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width, wallHeight, wallThickness]} />
          <meshStandardMaterial {...wallMaterialProps(surfaceOf("back"))} />
        </mesh>
      )}

      {wallsClosedSides >= 2 && (
        <mesh
          position={[-width / 2 + wallThickness / 2, wallCenterY, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[wallThickness, wallHeight, depth]} />
          <meshStandardMaterial {...wallMaterialProps(surfaceOf("left"))} />
        </mesh>
      )}

      {wallsClosedSides >= 3 && (
        <mesh
          position={[width / 2 - wallThickness / 2, wallCenterY, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[wallThickness, wallHeight, depth]} />
          <meshStandardMaterial {...wallMaterialProps(surfaceOf("right"))} />
        </mesh>
      )}

      {/* Lagerraum / Kabine (Drag-fähig im Edit-Modus) */}
      {cabinEnabled && cabin && (
        <Transformable
          enabled={editMode && isSelected("cabin")}
          mode={transformMode}
          snap={snapOn}
          onDragStart={disableOrbit}
          onDragEnd={enableOrbit}
          onChange={(pos) => {
            const c = clampXZ(pos.x, pos.z, width, depth, cabinWidth / 2, cabinDepth / 2);
            pos.set(c.x, pos.y, c.z);
            setConfig({
              modules: {
                cabin: {
                  position: { x: c.x, z: c.z },
                },
              } as any,
            });
          }}
        >
          <group
            position={[cabinPosX, cabinCenterY, cabinPosZ]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              setSelectedKey("cabin");
            }}
          >
            <mesh castShadow receiveShadow>
              <boxGeometry args={[cabinWidth, cabinHeight, cabinDepth]} />
              <meshStandardMaterial color="#d1d5db" roughness={0.9} metalness={0.05} />
            </mesh>

            {/* Türblatt (lokale Koordinaten) */}
            {(() => {
              const doorThickness = 0.04;
              const doorHeight = Math.min(2.1, cabinHeight - 0.2);
              const doorWidth = Math.min(0.9, cabinWidth - 0.2);
              const doorYLocal = -cabinHeight / 2 + doorHeight / 2;

              let doorPos: [number, number, number] = [0, doorYLocal, cabinDepth / 2 - doorThickness / 2];
              let doorRotationY = 0;

              switch (doorSide) {
                case "back":
                  doorPos = [0, doorYLocal, -cabinDepth / 2 + doorThickness / 2];
                  doorRotationY = Math.PI;
                  break;
                case "left":
                  doorPos = [-cabinWidth / 2 + doorThickness / 2, doorYLocal, 0];
                  doorRotationY = Math.PI / 2;
                  break;
                case "right":
                  doorPos = [cabinWidth / 2 - doorThickness / 2, doorYLocal, 0];
                  doorRotationY = -Math.PI / 2;
                  break;
                case "front":
                default:
                  break;
              }

              return (
                <mesh position={doorPos} rotation-y={doorRotationY}>
                  <boxGeometry args={[doorWidth, doorHeight, doorThickness]} />
                  <meshStandardMaterial color="#020617" />
                </mesh>
              );
            })()}

            {/* Auswahl-Rahmen */}
            {isSelected("cabin") && (
              <mesh>
                <boxGeometry args={[cabinWidth, cabinHeight, cabinDepth]} />
                <meshBasicMaterial wireframe color="#22d3ee" />
              </mesh>
            )}
          </group>
        </Transformable>
      )}

      {/* Counters – Detailed bevorzugt, sonst Legacy */}
      {countersDetailed.length > 0
        ? countersDetailed.map((ctr) => {
            const variant: CounterVariant = ctr.variant ?? (mAny.counterVariant ?? "basic");
            const w = ctr.size?.w ?? (variant === "premium" ? 1.4 : 0.9);
            const d = ctr.size?.d ?? (variant === "premium" ? 0.6 : 0.5);
            const h = ctr.size?.h ?? 1.1;
            const px = ctr.position?.x ?? 0;
            const pz = ctr.position?.z ?? 0;
            const key = `ctr-d-${ctr.id}`;
            const selected = isSelected(key);

            return (
              <Transformable
                key={key}
                enabled={editMode && selected}
                mode={transformMode}
                snap={snapOn}
                onDragStart={disableOrbit}
                onDragEnd={enableOrbit}
                onChange={(pos) => {
                  const c = clampXZ(pos.x, pos.z, width, depth, w / 2, d / 2);
                  pos.set(c.x, pos.y, c.z);
                  const next = countersDetailed.map((c0) =>
                    c0.id === ctr.id ? { ...c0, position: { ...c0.position, x: c.x, z: c.z } } : c0
                  );
                  setConfig({ modules: { countersDetailed: next } as any });
                }}
              >
                <group
                  position={[px, floorHeight, pz]}
                  rotation-y={ctr.rotationY ?? 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(key);
                  }}
                >
                  <group position={[0, h / 2, 0]}>
                    <CounterBlock variant={variant} w={w} d={d} h={h} />
                  </group>
                  {(ctr.withPower ?? countersWithPower) && (
                    <mesh position={[w / 2 - 0.1, 0.1, d / 2 - 0.1]} castShadow={false}>
                      <boxGeometry args={[0.08, 0.08, 0.08]} />
                      <meshStandardMaterial
                        color="#fbbf24"
                        emissive="#f59e0b"
                        emissiveIntensity={1.2}
                      />
                    </mesh>
                  )}
                  {selected && (
                    <mesh>
                      <boxGeometry args={[w, h, d]} />
                      <meshBasicMaterial wireframe color="#10b981" />
                    </mesh>
                  )}
                </group>
              </Transformable>
            );
          })
        : // Legacy: statisch – Doppelklick => Detailed
          Array.from({ length: counters ?? 0 }).map((_, idx) => {
            const spacing = width / ((counters ?? 0) + 1 || 1);
            const xPos = -width / 2 + spacing * (idx + 1);
            const zPos = countersPlacement === "island" ? 0 : depth / 2 - 0.5;
            const variant = (modules as any).counterVariant ?? "basic";
            const k = `legacy-counter-${idx}`;
            return (
              <group
                key={k}
                position={[xPos, floorHeight, zPos]}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  convertLegacyCountersToDetailed();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedKey(k);
                }}
              >
                <group position={[0, 0.55, 0]}>
                  <CounterBlock variant={variant} />
                </group>
                {countersWithPower && (
                  <mesh position={[0.45, 0.1, 0.25]} castShadow={false}>
                    <boxGeometry args={[0.08, 0.08, 0.08]} />
                    <meshStandardMaterial
                      color="#fbbf24"
                      emissive="#f59e0b"
                      emissiveIntensity={1.2}
                    />
                  </mesh>
                )}
                {editMode && (
                  <Html center position={[0, 1.1, 0]}>
                    <div className="badge-tip">Doppelklick: in „detailliert“ umwandeln</div>
                  </Html>
                )}
              </group>
            );
          })}

      {/* LED-Rahmen (Legacy – verteilt an einer Wand) */}
      {Array.from({ length: ledFrames ?? 0 }).map((_, idx) => {
        const total = ledFrames || 1;

        if (ledWallSide === "back") {
          const spacing = width / (total + 1);
          const xPos = -width / 2 + spacing * (idx + 1);
          return (
            <mesh key={`led-${idx}`} position={[xPos, floorHeight + 1.5, backWallFrontZ]}>
              <boxGeometry args={[1.2, 2.2, 0.03]} />
              <meshStandardMaterial emissive="#38bdf8" emissiveIntensity={2.2} color="#0f172a" roughness={0.4} />
            </mesh>
          );
        }

        if (ledWallSide === "left") {
          const spacing = depth / (total + 1);
          const zPos = -depth / 2 + spacing * (idx + 1);
          return (
            <mesh key={`led-${idx}`} position={[leftWallInnerX, floorHeight + 1.5, zPos]} rotation-y={Math.PI / 2}>
              <boxGeometry args={[1.2, 2.2, 0.03]} />
              <meshStandardMaterial emissive="#38bdf8" emissiveIntensity={2.2} color="#0f172a" roughness={0.4} />
            </mesh>
          );
        }

        const spacing = depth / (total + 1);
        const zPos = -depth / 2 + spacing * (idx + 1);
        return (
          <mesh key={`led-${idx}`} position={[rightWallInnerX, floorHeight + 1.5, zPos]} rotation-y={-Math.PI / 2}>
            <boxGeometry args={[1.2, 2.2, 0.03]} />
            <meshStandardMaterial emissive="#38bdf8" emissiveIntensity={2.2} color="#0f172a" roughness={0.4} />
          </mesh>
        );
      })}

      {/* Screens – Detailed bevorzugt, sonst Legacy */}
      {screensDetailed.length > 0
        ? screensDetailed.map((scr) => {
            const w = scr.size?.w ?? 0.9;
            const h = scr.size?.h ?? 0.55;
            const t = scr.size?.t ?? 0.02;
            const mount = scr.mount ?? "wall";
            const y = (scr.heightFromFloor ?? (floorHeight + 1.6)) - floorHeight; // lokaler Offset
            const key = `scr-d-${scr.id}`;
            const selected = isSelected(key);

            // Position & Rotation
            let px = scr.position?.x ?? 0;
            let pz = scr.position?.z ?? 0;
            let rotY = scr.rotationY ?? 0;

            // Clamping je nach Mount
            if (mount === "wall") {
              const side = scr.wallSide ?? "back";
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

            return (
              <Transformable
                key={key}
                enabled={editMode && selected}
                mode={transformMode}
                snap={snapOn}
                onDragStart={disableOrbit}
                onDragEnd={enableOrbit}
                onChange={(pos) => {
                  const c = clampXZ(pos.x, pos.z, width, depth, w / 2, t / 2);
                  pos.set(c.x, pos.y, c.z);
                  const next = screensDetailed.map((s0) =>
                    s0.id === scr.id
                      ? { ...s0, position: { x: c.x, z: c.z } }
                      : s0
                  );
                  setConfig({ modules: { detailedScreens: next } as any });
                }}
              >
                <group
                  position={[px, floorHeight + y, pz]}
                  rotation-y={rotY}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(key);
                  }}
                >
                  <ScreenPanel w={w} h={h} t={t} />
                  {selected && (
                    <mesh>
                      <boxGeometry args={[w, h, t]} />
                      <meshBasicMaterial wireframe color="#f43f5e" />
                    </mesh>
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
              return (
                <group
                  key={`screen-${idx}`}
                  position={[xPos, floorHeight + 1.6, backWallFrontZ]}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    convertLegacyScreensToDetailed();
                  }}
                >
                  <ScreenPanel />
                  {editMode && (
                    <Html center position={[0, 0, 0.06]}>
                      <div className="badge-tip">Doppelklick: in „detailliert“ umwandeln</div>
                    </Html>
                  )}
                </group>
              );
            }

            if (screensWallSide === "left") {
              const spacing = depth / (total + 1);
              const zPos = -depth / 2 + spacing * (idx + 1);
              return (
                <group
                  key={`screen-${idx}`}
                  position={[leftWallInnerX, floorHeight + 1.6, zPos]}
                  rotation-y={Math.PI / 2}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    convertLegacyScreensToDetailed();
                  }}
                >
                  <ScreenPanel />
                  {editMode && (
                    <Html center position={[0, 0, 0.06]}>
                      <div className="badge-tip">Doppelklick: in „detailliert“ umwandeln</div>
                    </Html>
                  )}
                </group>
              );
            }

            const spacing = depth / (total + 1);
            const zPos = -depth / 2 + spacing * (idx + 1);
            return (
              <group
                key={`screen-${idx}`}
                position={[rightWallInnerX, floorHeight + 1.6, zPos]}
                rotation-y={-Math.PI / 2}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  convertLegacyScreensToDetailed();
                }}
              >
                <ScreenPanel />
                {editMode && (
                  <Html center position={[0, 0, 0.06]}>
                    <div className="badge-tip">Doppelklick: in „detailliert“ umwandeln</div>
                  </Html>
                )}
              </group>
            );
          })}

      {/* Wand-Strahler Rückwand */}
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
                <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={1.1} />
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
                <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={1.1} />
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
                <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={1.1} />
              </mesh>
              <pointLight position={[x - 0.05, y - 0.05, z]} intensity={0.9} distance={4} decay={2} color="#fee2b3" />
            </group>
          );
        })}

      {/* Truss – Rahmen + Lampen + Bannerrahmen (mit Offset & Drag-Griff) */}
      {trussEnabled && (
        <group position={[trussOffsetX, 0, trussOffsetZ]}>
          {/* Drag-Griff für Truss (EditMode) */}
          <Transformable
            enabled={editMode && isSelected("truss")}
            mode={transformMode}
            snap={snapOn}
            onDragStart={disableOrbit}
            onDragEnd={enableOrbit}
            onChange={(pos) => {
              const c = clampXZ(pos.x, pos.z, width, depth, 0.4, 0.4);
              pos.set(c.x, pos.y, c.z);
              setConfig({ modules: { trussOffset: { x: c.x, z: c.z } } as any });
            }}
          >
            <group
              position={[0, trussHeight, 0]}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedKey("truss");
              }}
            >
              {/* Kleiner visueller Griff */}
              {editMode && (
                <mesh>
                  <torusGeometry args={[0.25, 0.02, 8, 24]} />
                  <meshStandardMaterial color="#22d3ee" metalness={0.7} roughness={0.25} />
                </mesh>
              )}
            </group>
          </Transformable>

          {/* Truss-Rahmen */}
          <mesh position={[0, trussHeight, depth / 2]} castShadow>
            <boxGeometry args={[width, 0.08, 0.08]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, trussHeight, -depth / 2]} castShadow>
            <boxGeometry args={[width, 0.08, 0.08]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[-width / 2, trussHeight, 0]} castShadow>
            <boxGeometry args={[0.08, 0.08, depth]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[width / 2, trussHeight, 0]} castShadow>
            <boxGeometry args={[0.08, 0.08, depth]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Truss-Lampen */}
          {trussLightsFront > 0 &&
            Array.from({ length: trussLightsFront }).map((_, i) => {
              const spacing = width / (trussLightsFront + 1);
              const x = -width / 2 + spacing * (i + 1);
              const y = trussHeight - 0.05;
              const z = depth / 2 - 0.04;
              return renderTrussLight(`truss-front-${i}`, x, y, z, x, y - 0.15, z - 0.25);
            })}

          {trussLightsBack > 0 &&
            Array.from({ length: trussLightsBack }).map((_, i) => {
              const spacing = width / (trussLightsBack + 1);
              const x = -width / 2 + spacing * (i + 1);
              const y = trussHeight - 0.05;
              const z = -depth / 2 + 0.04;
              return renderTrussLight(`truss-back-${i}`, x, y, z, x, y - 0.15, z + 0.25);
            })}

          {trussLightsLeft > 0 &&
            Array.from({ length: trussLightsLeft }).map((_, i) => {
              const spacing = depth / (trussLightsLeft + 1);
              const z = -depth / 2 + spacing * (i + 1);
              const y = trussHeight - 0.05;
              const x = -width / 2 + 0.04;
              return renderTrussLight(`truss-left-${i}`, x, y, z, x + 0.25, y - 0.15, z);
            })}

          {trussLightsRight > 0 &&
            Array.from({ length: trussLightsRight }).map((_, i) => {
              const spacing = depth / (trussLightsRight + 1);
              const z = -depth / 2 + spacing * (i + 1);
              const y = trussHeight - 0.05;
              const x = width / 2 - 0.04;
              return renderTrussLight(`truss-right-${i}`, x, y, z, x - 0.25, y - 0.15, z);
            })}

          {/* Bannerrahmen */}
          {(() => {
            const bannerY = trussHeight - 0.4 - bannerHeight / 2;
            const banners: ReactNode[] = [];

            const materialProps = bannerTexture
              ? { map: bannerTexture as any }
              : ({ color: "#111827", roughness: 0.5, metalness: 0.2 } as const);

            // Front
            if (bannersFront > 0) {
              Array.from({ length: bannersFront }).forEach((_, i) => {
                const spacing = width / (bannersFront + 1);
                const x = -width / 2 + spacing * (i + 1);
                const z = depth / 2 - 0.05;
                banners.push(
                  <mesh key={`banner-front-${i}`} position={[x, bannerY, z]} castShadow>
                    <boxGeometry args={[bannerWidth, bannerHeight, bannerThickness]} />
                    <meshStandardMaterial {...materialProps} />
                  </mesh>
                );
              });
            }

            // Back
            if (bannersBack > 0) {
              Array.from({ length: bannersBack }).forEach((_, i) => {
                const spacing = width / (bannersBack + 1);
                const x = -width / 2 + spacing * (i + 1);
                const z = -depth / 2 + 0.05;
                banners.push(
                  <mesh key={`banner-back-${i}`} position={[x, bannerY, z]} castShadow>
                    <boxGeometry args={[bannerWidth, bannerHeight, bannerThickness]} />
                    <meshStandardMaterial {...materialProps} />
                  </mesh>
                );
              });
            }

            // Left
            if (bannersLeft > 0) {
              Array.from({ length: bannersLeft }).forEach((_, i) => {
                const spacing = depth / (bannersLeft + 1);
                const z = -depth / 2 + spacing * (i + 1);
                const x = -width / 2 + 0.05;
                banners.push(
                  <mesh key={`banner-left-${i}`} position={[x, bannerY, z]} rotation-y={Math.PI / 2} castShadow>
                    <boxGeometry args={[bannerWidth, bannerHeight, bannerThickness]} />
                    <meshStandardMaterial {...materialProps} />
                  </mesh>
                );
              });
            }

            // Right
            if (bannersRight > 0) {
              Array.from({ length: bannersRight }).forEach((_, i) => {
                const spacing = depth / (bannersRight + 1);
                const z = -depth / 2 + spacing * (i + 1);
                const x = width / 2 - 0.05;
                banners.push(
                  <mesh key={`banner-right-${i}`} position={[x, bannerY, z]} rotation-y={-Math.PI / 2} castShadow>
                    <boxGeometry args={[bannerWidth, bannerHeight, bannerThickness]} />
                    <meshStandardMaterial {...materialProps} />
                  </mesh>
                );
              });
            }

            return banners;
          })()}
        </group>
      )}
    </group>
  );
}

export default function Configurator3D() {
  const orbitRef = useRef<any>(null);

  return (
    <Canvas
      shadows
      camera={{ position: [6, 5, 8], fov: 45 }}
      className="canvas-root"
      onPointerMissed={() => {
        // Fallback-Deselect, falls obere Ebene Events nicht bekommt
        // (Selektion-Reset passiert primär in StandMesh)
      }}
    >
      <color attach="background" args={["#020617"]} />

      <ambientLight intensity={0.35} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-4, 6, -4]} intensity={0.4} />

      <Environment preset="city" />

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

      <Suspense fallback={null}>
        {/* OrbitRef an StandMesh weitergeben, damit Drag den Orbit sperrt */}
        <StandMesh orbitRef={orbitRef} />
      </Suspense>

      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.5}
        width={20}
        height={20}
        blur={1.8}
        far={15}
        resolution={1024}
        color="#000000"
      />

      <OrbitControls
        ref={orbitRef}
        enablePan
        enableZoom
        maxPolarAngle={Math.PI / 2.05}
        minDistance={4}
        maxDistance={18}
      />
    </Canvas>
  );
}
