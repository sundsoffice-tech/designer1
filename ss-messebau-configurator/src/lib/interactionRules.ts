import * as THREE from "three";

export type WallSide = "back" | "left" | "right";

export type InteractionProfileKey = "counter" | "screen" | "cabin" | "truss";

export type InteractionProfile = {
  allowedLevels: ("floor" | "wall")[];
  snapToNearestWall?: boolean;
  defaultRotation?: number;
  rotationByWall?: Partial<Record<WallSide, number>>;
  gridSnap?: number;
};

export type InteractionContext = {
  width: number;
  depth: number;
  floorHeight: number;
  wallThickness: number;
  panelGap: number;
};

export type InteractionOptions = {
  mount?: "floor" | "wall" | "truss";
  wallSide?: WallSide;
  halfSize?: { x?: number; z?: number };
  wallSnapPadding?: Partial<Record<WallSide, { along?: number; away?: number }>>;
  onCommit?: (result: InteractionResult) => void;
};

export type InteractionResult = {
  position: THREE.Vector3;
  rotationY?: number;
  wallSide?: WallSide;
};

export const interactionProfiles: Record<InteractionProfileKey, InteractionProfile> = {
  counter: {
    allowedLevels: ["floor"],
    gridSnap: 0.05,
    defaultRotation: 0,
  },
  screen: {
    allowedLevels: ["wall", "floor"],
    snapToNearestWall: true,
    gridSnap: 0.05,
    defaultRotation: 0,
    rotationByWall: {
      back: 0,
      left: Math.PI / 2,
      right: -Math.PI / 2,
    },
  },
  cabin: {
    allowedLevels: ["floor"],
    defaultRotation: 0,
  },
  truss: {
    allowedLevels: ["floor"],
    defaultRotation: 0,
    gridSnap: 0.05,
  },
};

const clampXZ = (
  x: number,
  z: number,
  context: InteractionContext,
  halfX = 0,
  halfZ = 0
) => {
  const { width, depth } = context;
  const minX = -width / 2 + halfX;
  const maxX = width / 2 - halfX;
  const minZ = -depth / 2 + halfZ;
  const maxZ = depth / 2 - halfZ;

  return {
    x: Math.min(maxX, Math.max(minX, x)),
    z: Math.min(maxZ, Math.max(minZ, z)),
  };
};

const snapToGrid = (value: number, grid?: number) => {
  if (!grid) return value;
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
};

const findNearestWallSide = (position: THREE.Vector3, context: InteractionContext): WallSide => {
  const backZ = -context.depth / 2 + context.wallThickness + context.panelGap;
  const leftX = -context.width / 2 + context.wallThickness + context.panelGap;
  const rightX = context.width / 2 - context.wallThickness - context.panelGap;

  const distances: Record<WallSide, number> = {
    back: Math.abs(position.z - backZ),
    left: Math.abs(position.x - leftX),
    right: Math.abs(position.x - rightX),
  };

  return (Object.entries(distances).sort((a, b) => a[1] - b[1])[0]?.[0] || "back") as WallSide;
};

export function applyInteractionRules(
  profile: InteractionProfile,
  position: THREE.Vector3,
  context: InteractionContext,
  options: InteractionOptions = {}
): InteractionResult {
  const { mount = "floor", wallSide, halfSize, wallSnapPadding } = options;
  const pos = position.clone();

  pos.x = snapToGrid(pos.x, profile.gridSnap);
  pos.z = snapToGrid(pos.z, profile.gridSnap);

  const backZ = -context.depth / 2 + context.wallThickness + context.panelGap;
  const leftX = -context.width / 2 + context.wallThickness + context.panelGap;
  const rightX = context.width / 2 - context.wallThickness - context.panelGap;

  if (mount === "wall" && profile.allowedLevels.includes("wall")) {
    const targetSide = wallSide ?? (profile.snapToNearestWall ? findNearestWallSide(pos, context) : "back");
    const along = wallSnapPadding?.[targetSide]?.along ?? halfSize?.x ?? 0;
    const away = wallSnapPadding?.[targetSide]?.away ?? halfSize?.z ?? 0.001;

    if (targetSide === "back") {
      pos.z = backZ + away;
      const clamped = clampXZ(pos.x, pos.z, context, along, 0);
      pos.x = clamped.x;
    } else if (targetSide === "left") {
      pos.x = leftX + away;
      const clamped = clampXZ(pos.x, pos.z, context, 0, along);
      pos.z = clamped.z;
    } else {
      pos.x = rightX - away;
      const clamped = clampXZ(pos.x, pos.z, context, 0, along);
      pos.z = clamped.z;
    }

    return {
      position: pos,
      rotationY: profile.rotationByWall?.[targetSide] ?? profile.defaultRotation,
      wallSide: targetSide,
    };
  }

  if (profile.allowedLevels.includes("floor")) {
    const halfX = halfSize?.x ?? 0;
    const halfZ = halfSize?.z ?? 0;
    const clamped = clampXZ(pos.x, pos.z, context, halfX, halfZ);
    pos.x = clamped.x;
    pos.z = clamped.z;
  }

  return {
    position: pos,
    rotationY: profile.defaultRotation,
    wallSide,
  };
}
