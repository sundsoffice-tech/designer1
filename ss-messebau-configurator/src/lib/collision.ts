import type { StandConfig } from "./pricing";

export type Aabb = {
  id: string;
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export const DEFAULT_CLEARANCE = 0.2;

export const intersects = (a: Aabb, b: Aabb) =>
  !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ);

export const makeAabb = (
  id: string,
  label: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  clearance: number = DEFAULT_CLEARANCE
): Aabb => {
  const halfW = width / 2 + clearance;
  const halfD = depth / 2 + clearance;
  return {
    id,
    label,
    minX: x - halfW,
    maxX: x + halfW,
    minZ: z - halfD,
    maxZ: z + halfD,
  };
};

export const findCollision = (
  candidate: Aabb,
  boxes: Aabb[],
  ignored: Set<string> = new Set()
): Aabb | undefined => {
  for (const box of boxes) {
    if (ignored.has(box.id)) continue;
    if (intersects(candidate, box)) return box;
  }
  return undefined;
};

export const findCollisionForMany = (
  candidates: Aabb[],
  boxes: Aabb[],
  ignored: Set<string> = new Set()
): { collided: boolean; hit?: Aabb; candidate?: Aabb } => {
  for (const candidate of candidates) {
    const hit = findCollision(candidate, boxes, ignored);
    if (hit) {
      return { collided: true, hit, candidate };
    }
  }
  return { collided: false };
};

export function buildSceneAabbs(
  cfg: StandConfig,
  clearance: number = DEFAULT_CLEARANCE
): Aabb[] {
  const boxes: Aabb[] = [];
  const modules = cfg.modules as any;
  const mAny = modules ?? {};

  // Kabine
  const cabin = mAny.cabin as
    | (StandConfig["modules"]["cabin"] & { position?: { x?: number; z?: number } })
    | undefined;
  if (cabin && (cabin.enabled ?? mAny.storageRoom)) {
    const x = cabin.position?.x ?? -cfg.width / 2 + (cabin.width ?? 1.5) / 2 + 0.25;
    const z = cabin.position?.z ?? -cfg.depth / 2 + (cabin.depth ?? 1.5) / 2 + 0.25;
    boxes.push(makeAabb("cabin", "Kabine", x, z, cabin.width ?? 1.5, cabin.depth ?? 1.5, clearance));
  }

  // Counters (detailliert)
  const countersDetailed = (mAny.countersDetailed ?? []) as {
    id: string;
    variant?: "basic" | "premium" | "corner";
    size?: { w?: number; d?: number };
    position?: { x?: number; z?: number };
  }[];
  countersDetailed.forEach((ctr) => {
    const variant = ctr.variant ?? (mAny.counterVariant ?? "basic");
    const w = ctr.size?.w ?? (variant === "premium" ? 1.4 : 0.9);
    const d = ctr.size?.d ?? (variant === "premium" ? 0.6 : 0.5);
    const x = ctr.position?.x ?? 0;
    const z = ctr.position?.z ?? 0;
    boxes.push(makeAabb(`ctr-d-${ctr.id}`, "Counter", x, z, w, d, clearance));
  });

  // Screens (nur detailliert)
  const detailedScreens = (mAny.detailedScreens ?? []) as {
    id: string;
    size?: { w?: number; h?: number; t?: number };
    mount?: "wall" | "truss" | "floor";
    wallSide?: "back" | "left" | "right";
    position?: { x?: number; z?: number };
    rotationY?: number;
  }[];

  detailedScreens.forEach((scr) => {
    const w = scr.size?.w ?? 0.9;
    const t = scr.size?.t ?? 0.02;
    const mount = scr.mount ?? "wall";
    const wallSide = scr.wallSide ?? "back";
    const x = scr.position?.x ?? 0;
    const z = scr.position?.z ?? 0;

    // Wall-Mount => Breite folgt Wand, Tiefe minimal
    if (mount === "wall") {
      if (wallSide === "left" || wallSide === "right") {
        boxes.push(makeAabb(`scr-d-${scr.id}`, "Screen", x, z, t || 0.05, w, clearance));
      } else {
        boxes.push(makeAabb(`scr-d-${scr.id}`, "Screen", x, z, w, t || 0.05, clearance));
      }
      return;
    }

    const depth = mount === "floor" ? t || 0.1 : w * 0.25;
    boxes.push(makeAabb(`scr-d-${scr.id}`, "Screen", x, z, w, depth, clearance));
  });

  // Truss-Stützen (vier Eck-Pfosten)
  if (mAny.truss) {
    const columnSize = 0.12; // etwas größer als die optischen 8 cm
    const offsetX = mAny.trussOffset?.x ?? 0;
    const offsetZ = mAny.trussOffset?.z ?? 0;

    const positions: [string, number, number][] = [
      ["truss-col-front-left", -cfg.width / 2 + offsetX, cfg.depth / 2 + offsetZ],
      ["truss-col-front-right", cfg.width / 2 + offsetX, cfg.depth / 2 + offsetZ],
      ["truss-col-back-left", -cfg.width / 2 + offsetX, -cfg.depth / 2 + offsetZ],
      ["truss-col-back-right", cfg.width / 2 + offsetX, -cfg.depth / 2 + offsetZ],
    ];

    positions.forEach(([id, x, z]) => {
      boxes.push(makeAabb(id, "Truss-Stütze", x, z, columnSize, columnSize, clearance));
    });
  }

  return boxes;
}
