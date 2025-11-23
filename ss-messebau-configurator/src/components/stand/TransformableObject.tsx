import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { TransformControls } from "@react-three/drei";
import { RigidBody, type RapierRigidBody, type RigidBodyAutoCollider, type RigidBodyTypeString } from "@react-three/rapier";
import * as THREE from "three";
import { invalidate } from "@react-three/fiber";
import { buildColliderBounds, type ColliderBounds } from "../../lib/collision3d";
import type { ColliderType } from "../../types/modules";

type TransformMode = "translate" | "rotate" | "scale";

export type TransformableObjectProps = {
  children: ReactNode;
  enabled?: boolean;
  mode?: TransformMode;
  snap?: boolean;
  gridSize?: number;
  collider?: ColliderType;
  showX?: boolean;
  showY?: boolean;
  showZ?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  onChange?: (position: THREE.Vector3, object: THREE.Group) => void;
  onTransform?: (object: THREE.Group) => void;
  onDragStart?: () => void;
  onDragEnd?: (object: THREE.Group) => void;
  onBoundsChange?: (bounds: ColliderBounds) => void;
  physics?: {
    enabled?: boolean;
    type?: RigidBodyTypeString;
    bodyRef?: MutableRefObject<RapierRigidBody | null>;
    colliders?: RigidBodyAutoCollider | false;
    restitution?: number;
    friction?: number;
    linearDamping?: number;
    angularDamping?: number;
    gravityScale?: number;
    enabledTranslations?: [boolean, boolean, boolean];
    enabledRotations?: [boolean, boolean, boolean];
    userData?: Record<string, unknown>;
    onCollisionChange?: (colliding: boolean) => void;
  };
};

const DEFAULT_GRID = 0.25;
const DEFAULT_ROTATION_SNAP = THREE.MathUtils.degToRad(15);
const ROT_EPSILON = 1e-3;

const pickColliderType = (collider: ColliderType | undefined, rotationY: number | undefined): ColliderType | undefined => {
  if (!collider) return collider;
  if (collider === "aabb" && Math.abs(rotationY ?? 0) > ROT_EPSILON) return "obb";
  return collider;
};

/**
 * Shared wrapper around TransformControls that also emits collider updates.
 */
export function TransformableObject({
  children,
  enabled = false,
  mode = "translate",
  snap = false,
  gridSize = DEFAULT_GRID,
  collider,
  showX = true,
  showY = true,
  showZ = true,
  position,
  rotation,
  scale,
  onChange,
  onTransform,
  onDragStart,
  onDragEnd,
  onBoundsChange,
  physics,
}: TransformableObjectProps) {
  const controlsRef = useRef<any>(null);
  const groupRef = useRef<THREE.Group>(null!);
  const rigidRef = physics?.bodyRef ?? useRef<RapierRigidBody | null>(null);
  const worldPos = useMemo(() => new THREE.Vector3(), []);
  const worldQuat = useMemo(() => new THREE.Quaternion(), []);

  useEffect(() => {
    const ctrl = controlsRef.current;
    const group = groupRef.current;
    if (!ctrl || !group) return;

    const syncPhysics = () => {
      if (!physics?.enabled) return;
      const body = rigidRef.current;
      if (!body) return;
      group.getWorldPosition(worldPos);
      group.getWorldQuaternion(worldQuat);
      body.setNextKinematicTranslation({ x: worldPos.x, y: worldPos.y, z: worldPos.z });
      body.setNextKinematicRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    };

    const emitBounds = () => {
      if (!collider || !onBoundsChange) return;
      const effectiveCollider = pickColliderType(collider, group.rotation?.y);
      onBoundsChange(buildColliderBounds(group, effectiveCollider));
    };

    const handleChange = () => {
      group.getWorldPosition(worldPos);
      onChange?.(worldPos, group);
      onTransform?.(group);
      syncPhysics();
      emitBounds();
      invalidate();
    };
    const handleMouseDown = () => {
      onDragStart?.();
      invalidate();
    };
    const handleMouseUp = () => {
      onDragEnd?.(group);
      invalidate();
    };
    const handleDraggingChanged = (e: any) => {
      if (e?.value === true) onDragStart?.();
      else onDragEnd?.(group);
      invalidate();
    };

    ctrl.addEventListener("objectChange", handleChange);
    ctrl.addEventListener("mouseDown", handleMouseDown);
    ctrl.addEventListener("mouseUp", handleMouseUp);
    ctrl.addEventListener("dragging-changed", handleDraggingChanged);

    syncPhysics();
    emitBounds();

    return () => {
      ctrl.removeEventListener("objectChange", handleChange);
      ctrl.removeEventListener("mouseDown", handleMouseDown);
      ctrl.removeEventListener("mouseUp", handleMouseUp);
      ctrl.removeEventListener("dragging-changed", handleDraggingChanged);
    };
  }, [
    collider,
    onBoundsChange,
    onChange,
    onDragEnd,
    onDragStart,
    onTransform,
    physics?.enabled,
    physics?.bodyRef,
    worldPos,
    worldQuat,
    invalidate,
  ]);

  useEffect(() => {
    if (!collider || !onBoundsChange) return;
    const group = groupRef.current;
    if (!group) return;
    const effectiveCollider = pickColliderType(collider, group.rotation?.y);
    onBoundsChange(buildColliderBounds(group, effectiveCollider));
  }, [collider, onBoundsChange, position, rotation, scale]);

  useEffect(() => {
    if (!physics?.enabled) return;
    const body = rigidRef.current;
    if (!body) return;
    groupRef.current?.getWorldPosition(worldPos);
    groupRef.current?.getWorldQuaternion(worldQuat);
    body.setNextKinematicTranslation({ x: worldPos.x, y: worldPos.y, z: worldPos.z });
    body.setNextKinematicRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });
  }, [physics?.enabled, position, rotation, scale, worldPos, worldQuat]);

  const rigidBodyProps = physics?.enabled
    ? {
        ref: rigidRef,
        type: physics.type ?? "kinematicPosition",
        colliders: physics.colliders ?? "cuboid",
        restitution: physics.restitution ?? 0.08,
        friction: physics.friction ?? 0.9,
        linearDamping: physics.linearDamping ?? 6,
        angularDamping: physics.angularDamping ?? 6,
        gravityScale: physics.gravityScale ?? 0,
        enabledTranslations: physics.enabledTranslations ?? ([true, false, true] as [boolean, boolean, boolean]),
        enabledRotations: physics.enabledRotations ?? ([false, true, false] as [boolean, boolean, boolean]),
        userData: physics.userData,
        onCollisionEnter: () => physics.onCollisionChange?.(true),
        onCollisionExit: () => physics.onCollisionChange?.(false),
        position,
        rotation,
      }
    : undefined;

  const content = (
    <group
      ref={groupRef}
      position={physics?.enabled ? undefined : position}
      rotation={physics?.enabled ? undefined : rotation}
      scale={scale}
    >
      {children}
    </group>
  );

  const wrapped = physics?.enabled ? <RigidBody {...(rigidBodyProps as any)}>{content}</RigidBody> : content;

  if (!enabled) {
    return wrapped;
  }

  return (
    <TransformControls
      ref={controlsRef}
      mode={mode}
      showX={showX}
      showY={showY}
      showZ={showZ}
      translationSnap={snap ? gridSize : 0}
      rotationSnap={snap ? DEFAULT_ROTATION_SNAP : 0}
      scaleSnap={snap ? 0.1 : 0}
    >
      {wrapped}
    </TransformControls>
  );
}
