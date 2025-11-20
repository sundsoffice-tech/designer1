import type { WallSide } from "./pricing";

export type StandArea = {
  width: number;
  depth: number;
  wallThickness?: number;
  panelGap?: number;
};

export type InteractionProfile = {
  size: { w: number; d: number };
  mount: "floor" | "wall";
  wallSide?: WallSide;
  stickToWall?: boolean;
  snapGap?: number;
  padding?: number;
};

export type NormalizedPlacement = {
  position: { x: number; z: number };
  rotationY?: number;
};

export type AABB = {
  id?: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function clampToStand(
  x: number,
  z: number,
  stand: StandArea,
  halfW = 0,
  halfD = 0
): { x: number; z: number } {
  const minX = -stand.width / 2 + halfW;
  const maxX = stand.width / 2 - halfW;
  const minZ = -stand.depth / 2 + halfD;
  const maxZ = stand.depth / 2 - halfD;

  return {
    x: Math.min(maxX, Math.max(minX, x)),
    z: Math.min(maxZ, Math.max(minZ, z)),
  };
}

export function wallAnchor(
  side: WallSide,
  stand: StandArea,
  offset = 0
): { x?: number; z?: number; rotationY: number } {
  const thickness = stand.wallThickness ?? 0;
  const gap = stand.panelGap ?? 0;

  if (side === "back") {
    return { z: -stand.depth / 2 + thickness + gap + offset, rotationY: 0 };
  }
  if (side === "left") {
    return { x: -stand.width / 2 + thickness + gap + offset, rotationY: Math.PI / 2 };
  }
  return { x: stand.width / 2 - thickness - gap - offset, rotationY: -Math.PI / 2 };
}

export function normalizePlacement(
  target: { x: number; z: number },
  profile: InteractionProfile,
  stand: StandArea
): NormalizedPlacement {
  const halfW = profile.size.w / 2;
  const halfD = profile.size.d / 2;
  let { x, z } = target;
  let rotationY: number | undefined;

  if (profile.mount === "wall" && profile.wallSide) {
    const anchor = wallAnchor(profile.wallSide, stand, profile.snapGap ?? 0);
    rotationY = anchor.rotationY;

    if (profile.wallSide === "back") {
      z = anchor.z ?? z;
      const clamped = clampToStand(x, z, stand, halfW, 0.001);
      x = clamped.x;
    } else {
      x = anchor.x ?? x;
      const clamped = clampToStand(x, z, stand, 0.001, halfD);
      z = clamped.z;
    }
  } else {
    const clamped = clampToStand(x, z, stand, halfW, halfD);
    x = clamped.x;
    z = clamped.z;

    if (profile.stickToWall && profile.wallSide) {
      const anchor = wallAnchor(profile.wallSide, stand, profile.snapGap ?? 0);
      if (anchor.x !== undefined) x = anchor.x;
      if (anchor.z !== undefined) z = anchor.z;
      rotationY = anchor.rotationY;
    }
  }

  return { position: { x, z }, rotationY };
}

export function buildAABB(
  position: { x: number; z: number },
  size: { w: number; d: number },
  padding = 0,
  id?: string
): AABB {
  const halfW = size.w / 2 + padding;
  const halfD = size.d / 2 + padding;
  return {
    id,
    minX: position.x - halfW,
    maxX: position.x + halfW,
    minZ: position.z - halfD,
    maxZ: position.z + halfD,
  };
}

export function intersects(a: AABB, b: AABB): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

export function hasCollision(candidate: AABB, others: AABB[], ignoreId?: string): boolean {
  return others.some((box) => box.id !== ignoreId && intersects(candidate, box));
}
