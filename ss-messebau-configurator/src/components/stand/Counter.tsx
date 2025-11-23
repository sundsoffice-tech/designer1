import { useMemo, useRef } from "react";
import { Detailed, Html } from "@react-three/drei";
import type { CounterVariant } from "../../lib/pricing";
import { COUNTER_DIMENSIONS, resolveCounterSize } from "../../config/objectDimensions";
import { TransformableObject, type TransformableObjectProps } from "./TransformableObject";
import type { CounterFinish } from "../../store/materialStore";
import type { ColliderType } from "../../types/modules";
import { lightenColor } from "../../utils/color";
import { DEFAULT_LOD_DISTANCES } from "../../config/lod";
import { SELECTION_OUTLINE_COLOR } from "../../config/selection";
import type { ThreeEvent } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";

type CounterColors = { body?: string; accent?: string; top?: string };

type CounterControls = Pick<
  TransformableObjectProps,
  "enabled" | "mode" | "snap" | "gridSize" | "showX" | "showY" | "showZ"
>;

type CounterDetailLevel = "high" | "medium" | "low";

export type Counter3DProps = {
  id: string;
  variant: CounterVariant;
  size?: { w?: number; d?: number; h?: number };
  finish?: CounterFinish;
  colors?: CounterColors;
  position: { x: number; y: number; z: number };
  rotationY?: number;
  power?: boolean;
  selected?: boolean;
  colliding?: boolean;
  impacting?: boolean;
  collisionClearance?: number;
  collider?: ColliderType;
  controls: CounterControls;
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

const CounterMesh = ({
  variant,
  w,
  d,
  h,
  finish,
  colors,
  detail = "high",
}: {
  variant: CounterVariant;
  w?: number;
  d?: number;
  h?: number;
  finish?: CounterFinish;
  colors?: CounterColors;
  detail?: CounterDetailLevel;
}) => {
  const defaults = COUNTER_DIMENSIONS[variant] ?? COUNTER_DIMENSIONS.basic;
  const effectiveW = w ?? defaults.w;
  const effectiveD = d ?? defaults.d;
  const effectiveH = h ?? defaults.h;
  const bodyW = Math.max(effectiveW, defaults.w);
  const bodyD = Math.max(effectiveD, defaults.d);

  const fallbackMaterial = {
    body: variant === "premium" ? "#0f172a" : "#1d4ed8",
    accent: variant === "corner" ? "#1e293b" : "#1d4ed8",
    top: "#e5e7eb",
    roughness: variant === "premium" ? 0.4 : 0.35,
    metalness: variant === "premium" ? 0.6 : 0.45,
  };

  const bodyColor = colors?.body ?? finish?.color ?? fallbackMaterial.body;
  const accentColor = colors?.accent ?? finish?.accentColor ?? lightenColor(bodyColor, 0.18);
  const topColor = colors?.top ?? finish?.topColor ?? lightenColor(bodyColor, 0.35);
  const roughness = finish?.roughness ?? fallbackMaterial.roughness;
  const metalness = finish?.metalness ?? fallbackMaterial.metalness;

  if (variant === "basic") {
    if (detail === "low") {
      return (
        <mesh position={[0, effectiveH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[bodyW, effectiveH, bodyD]} />
          <meshBasicMaterial color={bodyColor} wireframe />
        </mesh>
      );
    }

    if (detail === "medium") {
      return (
        <group>
          <mesh position={[0, effectiveH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[bodyW, effectiveH, bodyD]} />
            <meshStandardMaterial
              color={bodyColor}
              roughness={roughness + 0.08}
              metalness={metalness * 0.6}
            />
          </mesh>
          <mesh position={[0, effectiveH + 0.02, 0]}>
            <boxGeometry args={[bodyW * 1.02, 0.05, bodyD * 1.02]} />
            <meshStandardMaterial color={topColor} roughness={0.35} metalness={0.2} />
          </mesh>
        </group>
      );
    }

    return (
      <mesh position={[0, effectiveH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[bodyW, effectiveH, bodyD]} />
        <meshStandardMaterial color={bodyColor} roughness={roughness} metalness={metalness} />
      </mesh>
    );
  }

  if (variant === "premium") {
    if (detail === "low") {
      return (
        <mesh position={[0, effectiveH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[bodyW, effectiveH, bodyD]} />
          <meshBasicMaterial color={bodyColor} wireframe />
        </mesh>
      );
    }

    if (detail === "medium") {
      return (
        <group>
          <mesh position={[0, effectiveH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[bodyW, effectiveH, bodyD]} />
            <meshStandardMaterial color={bodyColor} roughness={roughness + 0.05} metalness={metalness * 0.8} />
          </mesh>
          <mesh position={[0, effectiveH + 0.02, 0]}>
            <boxGeometry args={[Math.max(bodyW, defaults.w), 0.05, Math.max(bodyD, defaults.d)]} />
            <meshStandardMaterial color={topColor} roughness={0.3} metalness={0.35} />
          </mesh>
        </group>
      );
    }

    return (
      <group>
        <mesh position={[0, effectiveH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[bodyW, effectiveH, bodyD]} />
          <meshStandardMaterial color={bodyColor} roughness={roughness} metalness={metalness} />
        </mesh>
        <mesh position={[0, effectiveH * 0.7, bodyD / 2 - 0.3]} castShadow={false}>
          <boxGeometry args={[1.25, 0.5, 0.02]} />
          <meshStandardMaterial color={accentColor} roughness={0.2} metalness={0.7} />
        </mesh>
        <mesh position={[0, effectiveH + 0.02, 0]}>
          <boxGeometry
            args={[
              Math.max(bodyW, defaults.w + 0.05),
              0.06,
              Math.max(bodyD, defaults.d + 0.05),
            ]}
          />
          <meshStandardMaterial color={topColor} roughness={0.2} metalness={0.3} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[-(bodyW - bodyD) / 2, effectiveH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[bodyW, effectiveH, bodyD]} />
        {detail === "low" ? (
          <meshBasicMaterial color={bodyColor} wireframe />
        ) : (
          <meshStandardMaterial
            color={bodyColor}
            roughness={detail === "medium" ? roughness + 0.08 : roughness}
            metalness={detail === "medium" ? metalness * 0.85 : metalness}
          />
        )}
      </mesh>
      <mesh position={[0, effectiveH / 2, -(bodyW - bodyD) / 2]} castShadow receiveShadow>
        <boxGeometry args={[bodyD, effectiveH, bodyW]} />
        {detail === "low" ? (
          <meshBasicMaterial color={accentColor} wireframe />
        ) : (
          <meshStandardMaterial
            color={accentColor}
            roughness={detail === "medium" ? roughness + 0.08 : roughness}
            metalness={detail === "medium" ? metalness * 0.85 : metalness}
          />
        )}
      </mesh>
      {detail === "high" && (
        <mesh position={[-bodyD / 2, effectiveH + 0.02, -bodyD / 2]}>
          <boxGeometry args={[bodyW + bodyD * 0.2, 0.06, bodyW + bodyD * 0.2]} />
          <meshStandardMaterial color={topColor} roughness={0.3} metalness={0.3} />
        </mesh>
      )}
    </group>
  );
};

const CounterLodMesh = (props: Parameters<typeof CounterMesh>[0]) => (
  <Detailed distances={[...DEFAULT_LOD_DISTANCES]}>
    <CounterMesh {...props} detail="high" />
    <CounterMesh {...props} detail="medium" />
    <CounterMesh {...props} detail="low" />
  </Detailed>
);

export function Counter3D({
  id,
  variant,
  size,
  finish,
  colors,
  position,
  rotationY = 0,
  power,
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
}: Counter3DProps) {
  const { w, d, h } = resolveCounterSize(variant, size);
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const impactSize = useMemo(() => Math.max(w, d) * 0.65, [d, w]);

  return (
    <TransformableObject
      enabled={controls.enabled}
      mode={controls.mode}
      snap={controls.snap}
      gridSize={controls.gridSize}
      showX={controls.showX}
      showY={controls.showY}
      showZ={controls.showZ}
      position={[position.x, position.y, position.z]}
      rotation={[0, rotationY, 0]}
      collider={collider}
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
        friction: 0.9,
        restitution: 0.08,
        linearDamping: 5,
        angularDamping: 6,
        gravityScale: 0,
        enabledTranslations: [true, false, true],
        enabledRotations: [false, true, false],
        userData: { id, kind: "counter" },
        onCollisionChange,
      }}
    >
      <group
        userData={{ id, kind: "counter" }}
        onPointerDown={onPointerDown}
        onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      <CounterLodMesh variant={variant} w={w} d={d} h={h} finish={finish} colors={colors} />

        {power && (
          <mesh position={[w / 2 - 0.1, 0.1, d / 2 - 0.1]} castShadow={false}>
            <boxGeometry args={[0.08, 0.08, 0.08]} />
            <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.2} />
          </mesh>
        )}

        {impacting && (
          <mesh position={[0, h + 0.08, 0]}>
            <ringGeometry args={[impactSize * 0.35, impactSize * 0.55, 16]} />
            <meshBasicMaterial color="#f97316" transparent opacity={0.45} />
          </mesh>
        )}

        {selected && (
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, d]} />
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
          <>
            <mesh position={[0, h / 2, 0]}>
              <boxGeometry args={[w + collisionClearance * 2, h + 0.05, d + collisionClearance * 2]} />
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
                  whiteSpace: "nowrap",
                }}
              >
                Kollision erkannt
              </div>
            </Html>
          </>
        )}
      </group>
    </TransformableObject>
  );
}
