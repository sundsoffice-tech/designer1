import { Box3, Matrix3, Matrix4, Object3D, Vector3 } from "three";
import { OBB } from "three/examples/jsm/math/OBB.js";
import type { ColliderType } from "../types/modules";
import type { Aabb } from "./collision";

export type AabbBounds = {
  type: "aabb";
  box: Box3;
  size: Vector3;
  center: Vector3;
};

export type ObbBounds = {
  type: "obb";
  obb: OBB;
  size: Vector3;
  center: Vector3;
};

export type MeshBounds = {
  type: "mesh";
  obb: OBB;
  aabb: Box3;
  size: Vector3;
  center: Vector3;
};

export type ColliderBounds = AabbBounds | ObbBounds | MeshBounds;

export const computeAabbBounds = (object: Object3D): AabbBounds => {
  object.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(object);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  return { type: "aabb", box, size, center };
};

export const computeObbBounds = (object: Object3D): ObbBounds => {
  object.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(object);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  const rotation = new Matrix3().setFromMatrix4(new Matrix4().extractRotation(object.matrixWorld.clone()));
  const obb = new OBB();
  obb.center.copy(center);
  obb.halfSize.copy(size.multiplyScalar(0.5));
  obb.rotation.copy(rotation);

  return { type: "obb", obb, size, center };
};

export const computeMeshBounds = (object: Object3D): MeshBounds => {
  object.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(object);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  const rotation = new Matrix3().setFromMatrix4(new Matrix4().extractRotation(object.matrixWorld.clone()));
  const obb = new OBB();
  obb.center.copy(center);
  obb.halfSize.copy(size.multiplyScalar(0.5));
  obb.rotation.copy(rotation);
  return { type: "mesh", obb, aabb: box, size, center };
};

export const buildColliderBounds = (
  object: Object3D,
  type: ColliderType = "aabb"
): ColliderBounds => {
  if (type === "mesh") return computeMeshBounds(object);
  if (type === "obb") return computeObbBounds(object);
  return computeAabbBounds(object);
};

export const intersectsAabb = (a: AabbBounds, b: AabbBounds) =>
  !(a.box.max.x <= b.box.min.x || a.box.min.x >= b.box.max.x || a.box.max.z <= b.box.min.z || a.box.min.z >= b.box.max.z);

export const intersectsObb = (a: ObbBounds, b: ObbBounds) => a.obb.intersectsOBB(b.obb, Number.EPSILON);

const broadphaseAabb = (bounds: ColliderBounds): Box3 => {
  if (bounds.type === "aabb") return bounds.box;
  if (bounds.type === "obb") return obbToAabbBounds(bounds.obb).box;
  return bounds.aabb;
};

const boxToObb = (box: Box3): OBB => {
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  const obb = new OBB();
  obb.center.copy(center);
  obb.halfSize.copy(size.multiplyScalar(0.5));
  obb.rotation.identity();
  return obb;
};

const narrowphase = (a: ColliderBounds, b: ColliderBounds): boolean => {
  const isMeshA = a.type === "mesh";
  const isMeshB = b.type === "mesh";

  if (!isMeshA && !isMeshB) {
    if (a.type === "aabb" && b.type === "aabb") return intersectsAabb(a, b);
    if (a.type === "obb" && b.type === "obb") return intersectsObb(a, b);
    if (a.type === "aabb" && b.type === "obb") return b.obb.intersectsBox3(a.box);
    if (a.type === "obb" && b.type === "aabb") return a.obb.intersectsBox3(b.box);
  }

  const obbA = a.type === "mesh" ? a.obb : a.type === "obb" ? a.obb : boxToObb(a.box);
  const obbB = b.type === "mesh" ? b.obb : b.type === "obb" ? b.obb : boxToObb(b.box);

  if (!obbA.intersectsOBB(obbB, Number.EPSILON)) return false;

  return true;
};

const obbToAabbBounds = (obb: OBB): AabbBounds => {
  const corners: Vector3[] = [];
  // three-stdlib typings don't expose getCorners; fall back to any.
  (obb as any).getCorners?.(corners);
  const box = new Box3().setFromPoints(corners);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  return { type: "aabb", box, size, center };
};

export const intersectsColliders = (a: ColliderBounds, b: ColliderBounds) => {
  // Broadphase: cheap AABB overlap
  const aBox = broadphaseAabb(a);
  const bBox = broadphaseAabb(b);
  if (aBox.max.x <= bBox.min.x || aBox.min.x >= bBox.max.x || aBox.max.z <= bBox.min.z || aBox.min.z >= bBox.max.z) {
    return false;
  }

  // Narrowphase tailored to collider types
  return narrowphase(a, b);
};

export const colliderBoundsToAabb = (
  id: string,
  label: string,
  bounds: ColliderBounds,
  clearance = 0
): Aabb => {
  const baseBox =
    bounds.type === "aabb"
      ? bounds.box.clone()
      : bounds.type === "mesh"
      ? bounds.aabb.clone()
      : obbToAabbBounds(bounds.obb).box;
  if (clearance > 0) {
    baseBox.expandByScalar(clearance);
  }
  return {
    id,
    label,
    minX: baseBox.min.x,
    maxX: baseBox.max.x,
    minZ: baseBox.min.z,
    maxZ: baseBox.max.z,
  };
};

type FootprintOptions = {
  x: number;
  z: number;
  width: number;
  depth: number;
  height?: number;
  centerY?: number;
  clearance?: number;
  rotationY?: number;
};

/**
 * Helper to build collider bounds for simple rectangular footprints.
 * Uses OBB when requested, otherwise returns an aligned Box3.
 */
export const buildFootprintBounds = (
  opts: FootprintOptions,
  type: ColliderType = "aabb"
): ColliderBounds => {
  const {
    x,
    z,
    width,
    depth,
    height = 0.1,
    centerY = 0,
    clearance = 0,
    rotationY = 0,
  } = opts;

  const halfW = Math.abs(width) / 2 + Math.max(0, clearance);
  const halfD = Math.abs(depth) / 2 + Math.max(0, clearance);
  const halfH = Math.max(Math.abs(height) / 2, 0.05);

  if (type === "obb") {
    const obb = new OBB();
    obb.center.set(x, centerY, z);
    obb.halfSize.set(halfW, halfH, halfD);
    const rot = new Matrix4().makeRotationY(rotationY);
    obb.rotation.setFromMatrix4(rot);

    const size = new Vector3(halfW * 2, halfH * 2, halfD * 2);
    const center = new Vector3(x, centerY, z);
    return { type: "obb", obb, size, center };
  }

  if (type === "mesh") {
    const obb = new OBB();
    obb.center.set(x, centerY, z);
    obb.halfSize.set(halfW, halfH, halfD);
    const rot = new Matrix4().makeRotationY(rotationY);
    obb.rotation.setFromMatrix4(rot);

    const size = new Vector3(halfW * 2, halfH * 2, halfD * 2);
    const center = new Vector3(x, centerY, z);
    const min = new Vector3(x - halfW, centerY - halfH, z - halfD);
    const max = new Vector3(x + halfW, centerY + halfH, z + halfD);
    const aabb = new Box3(min, max);
    return { type: "mesh", obb, aabb, size, center };
  }

  const min = new Vector3(x - halfW, centerY - halfH, z - halfD);
  const max = new Vector3(x + halfW, centerY + halfH, z + halfD);
  const box = new Box3(min, max);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  return { type: "aabb", box, size, center };
};
