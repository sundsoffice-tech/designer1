import { resolveCounterSize, resolveSeatingGeometry } from "../config/objectDimensions";
import type { ChairConfig, StandConfig } from "./pricing";

export type CollisionKind = "cabin" | "counter" | "screen" | "chair" | "truss" | "custom";
export type CollisionRole = "floor" | "wall-attachment";
export type ColliderSpec = { x?: number; z?: number; width: number; depth: number };

type Vec2 = { x: number; z: number };
type Mat2 = [Vec2, Vec2];

export type Aabb = {
  id: string;
  parentId?: string;
  label: string;
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfDepth: number;
  rotationY: number;
  clearance: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  role?: CollisionRole;
  colliders?: Obb[];
  baseWidth?: number;
  baseDepth?: number;
};

export type Obb = Aabb & {
  center: Vec2;
  halfSize: Vec2;
  rotation: Mat2;
};

export const DEFAULT_CLEARANCE = 0.2;

export const MODULE_CLEARANCE_BY_KIND: Record<CollisionKind, number> = {
  cabin: 0.2,
  counter: 0.12,
  screen: 0.05,
  chair: 0.05,
  truss: 0.1,
  custom: 0.1,
};

const toSafeNumber = (value: number | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const buildRotationMatrix = (rotationY: number): Mat2 => {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [
    { x: cos, z: sin },
    { x: -sin, z: cos },
  ];
};

const rotateOffset = (offset: Vec2, rotation: Mat2): Vec2 => ({
  x: offset.x * rotation[0].x + offset.z * rotation[1].x,
  z: offset.x * rotation[0].z + offset.z * rotation[1].z,
});

export const resolveClearance = (
  kind: CollisionKind,
  custom?: number,
  global?: number
): number => {
  const customVal = toSafeNumber(custom);
  if (customVal !== undefined) return Math.max(0, customVal);
  const kindDefault = Math.max(0, toSafeNumber(MODULE_CLEARANCE_BY_KIND[kind]) ?? DEFAULT_CLEARANCE);
  const globalVal = toSafeNumber(global);
  if (globalVal !== undefined) return Math.max(0, kindDefault + globalVal);
  return kindDefault;
};

const normalize = (v: Vec2): Vec2 => {
  const len = Math.hypot(v.x, v.z);
  if (len === 0) return { x: 0, z: 0 };
  return { x: v.x / len, z: v.z / len };
};

const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z;

const computeCorners = (center: Vec2, halfSize: Vec2, rotation: Mat2): Vec2[] => {
  const dx: Vec2 = { x: rotation[0].x * halfSize.x, z: rotation[0].z * halfSize.x };
  const dz: Vec2 = { x: rotation[1].x * halfSize.z, z: rotation[1].z * halfSize.z };
  return [
    { x: center.x - dx.x - dz.x, z: center.z - dx.z - dz.z },
    { x: center.x + dx.x - dz.x, z: center.z + dx.z - dz.z },
    { x: center.x + dx.x + dz.x, z: center.z + dx.z + dz.z },
    { x: center.x - dx.x + dz.x, z: center.z - dx.z + dz.z },
  ];
};

const boundsFromCorners = (corners: Vec2[]) => {
  let minX = corners[0].x;
  let maxX = corners[0].x;
  let minZ = corners[0].z;
  let maxZ = corners[0].z;
  for (let i = 1; i < corners.length; i += 1) {
    const c = corners[i];
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minZ = Math.min(minZ, c.z);
    maxZ = Math.max(maxZ, c.z);
  }
  return { minX, maxX, minZ, maxZ };
};

const cornersOf = (box: Obb): Vec2[] => computeCorners(box.center, box.halfSize, box.rotation);

const projectOnto = (axis: Vec2, corners: Vec2[]) => {
  const n = normalize(axis);
  let min = dot(corners[0], n);
  let max = min;
  for (let i = 1; i < corners.length; i += 1) {
    const v = dot(corners[i], n);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
};

const overlapsOnAxis = (axis: Vec2, cornersA: Vec2[], cornersB: Vec2[]): boolean => {
  const projA = projectOnto(axis, cornersA);
  const projB = projectOnto(axis, cornersB);
  return !(projA.max < projB.min || projB.max < projA.min);
};

const resolveRole = (box?: Pick<Obb, "role">): CollisionRole => box?.role ?? "floor";

const shouldCollide = (a: Obb, b: Obb): boolean => {
  const roleA = resolveRole(a);
  const roleB = resolveRole(b);

  if (roleA === "wall-attachment" && roleB === "floor") return false;
  if (roleB === "wall-attachment" && roleA === "floor") return false;
  return true;
};

const partsOf = (box: Obb): Obb[] => (box.colliders?.length ? box.colliders : [box]);

const intersectsAabb = (a: Obb, b: Obb): boolean =>
  !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ);

export const intersectObb = (obbA: Obb, obbB: Obb): boolean => {
  const cornersA = cornersOf(obbA);
  const cornersB = cornersOf(obbB);
  const axes: Vec2[] = [
    obbA.rotation[0],
    obbA.rotation[1],
    obbB.rotation[0],
    obbB.rotation[1],
  ];

  for (const axis of axes) {
    if (!overlapsOnAxis(axis, cornersA, cornersB)) {
      return false;
    }
  }
  return true;
};

const intersects = (a: Obb, b: Obb): boolean => {
  const partsA = partsOf(a);
  const partsB = partsOf(b);
  for (const boxA of partsA) {
    for (const boxB of partsB) {
      if (!shouldCollide(boxA, boxB)) continue;
      if (!intersectsAabb(boxA, boxB)) continue;
      if (intersectObb(boxA, boxB)) return true;
    }
  }
  return false;
};

export const makeObb = (
  id: string,
  label: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  clearance: number = DEFAULT_CLEARANCE,
  rotationY: number = 0,
  colliders: ColliderSpec[] = [],
  role: CollisionRole = "floor"
): Obb => {
  const safeWidth = Number.isFinite(width) ? Math.abs(width) : 0;
  const safeDepth = Number.isFinite(depth) ? Math.abs(depth) : 0;
  const safeClearance = Math.max(0, clearance);
  const normRotation = Number.isFinite(rotationY) ? rotationY : 0;
  const rotation = buildRotationMatrix(normRotation);

  const makeHalfSize = (w: number, d: number): Vec2 => ({
    x: Math.abs(w) / 2 + safeClearance,
    z: Math.abs(d) / 2 + safeClearance,
  });

  const buildBox = (centerX: number, centerZ: number, w: number, d: number, suffix?: string): Obb => {
    const localW = Number.isFinite(w) ? Math.abs(w) : 0;
    const localD = Number.isFinite(d) ? Math.abs(d) : 0;
    const halfSize = makeHalfSize(localW, localD);
    const center: Vec2 = { x: centerX, z: centerZ };
    const corners = computeCorners(center, halfSize, rotation);
    const { minX, maxX, minZ, maxZ } = boundsFromCorners(corners);

    return {
      id: suffix ? `${id}${suffix}` : id,
      parentId: suffix ? id : undefined,
      label,
      center,
      centerX,
      centerZ,
      halfSize,
      halfWidth: halfSize.x,
      halfDepth: halfSize.z,
      rotation,
      rotationY: normRotation,
      clearance: safeClearance,
      minX,
      maxX,
      minZ,
      maxZ,
      role,
      baseWidth: localW,
      baseDepth: localD,
    };
  };

  if (colliders?.length) {
    const colliderBoxes = colliders.map((col, idx) => {
      const offset = rotateOffset({ x: col.x ?? 0, z: col.z ?? 0 }, rotation);
      return buildBox(x + offset.x, z + offset.z, col.width, col.depth, `::${idx}`);
    });
    const minX = colliderBoxes.reduce((min, box) => Math.min(min, box.minX), Number.POSITIVE_INFINITY);
    const maxX = colliderBoxes.reduce((max, box) => Math.max(max, box.maxX), Number.NEGATIVE_INFINITY);
    const minZ = colliderBoxes.reduce((min, box) => Math.min(min, box.minZ), Number.POSITIVE_INFINITY);
    const maxZ = colliderBoxes.reduce((max, box) => Math.max(max, box.maxZ), Number.NEGATIVE_INFINITY);
    return {
      id,
      label,
      center: { x, z },
      centerX: x,
      centerZ: z,
      halfSize: { x: (maxX - minX) / 2, z: (maxZ - minZ) / 2 },
      halfWidth: (maxX - minX) / 2,
      halfDepth: (maxZ - minZ) / 2,
      rotation,
      rotationY: normRotation,
      clearance: safeClearance,
      minX,
      maxX,
      minZ,
      maxZ,
      role,
      colliders: colliderBoxes,
      baseWidth: safeWidth,
      baseDepth: safeDepth,
    };
  }

  return buildBox(x, z, safeWidth, safeDepth);
};

const findCollision = (
  candidate: Obb,
  boxes: Obb[],
  ignored: Set<string> = new Set()
): Obb | undefined => {
  for (const box of boxes) {
    if (ignored.has(box.id)) continue;
    if (intersects(candidate, box)) return box;
  }
  return undefined;
};

export const findCollisionForMany = (
  candidates: Obb[],
  boxes: Obb[],
  ignored: Set<string> = new Set()
): { collided: boolean; hit?: Obb; candidate?: Obb } => {
  for (const candidate of candidates) {
    const hit = findCollision(candidate, boxes, ignored);
    if (hit) {
      return { collided: true, hit, candidate };
    }
  }
  return { collided: false };
};

export const cornerCounterColliders = (width: number, depth: number): ColliderSpec[] => {
  const w = Number.isFinite(width) ? Math.abs(width) : 0;
  const d = Number.isFinite(depth) ? Math.abs(depth) : 0;
  const offset = (w - d) / 2;
  return [
    { x: -offset, z: 0, width: w, depth: d },
    { x: 0, z: -offset, width: d, depth: w },
  ];
};

export function buildSceneAabbs(cfg: StandConfig, clearance: number = 0): Obb[] {
  const boxes: Obb[] = [];
  const modules = cfg.modules;
  const resolve = (kind: CollisionKind, custom?: number) => resolveClearance(kind, custom, clearance);

  // Kabine
  const cabin = modules.cabin;
  const cabinEnabled = Boolean(cabin?.enabled ?? modules.storageRoom);
  if (cabin && cabinEnabled) {
    const x = cabin.position?.x ?? -cfg.width / 2 + (cabin.width ?? 1.5) / 2 + 0.25;
    const z = cabin.position?.z ?? -cfg.depth / 2 + (cabin.depth ?? 1.5) / 2 + 0.25;
    const cabinClearance = resolve("cabin", (cabin as { clearance?: number }).clearance);
    boxes.push(
      makeObb(
        "cabin",
        "Kabine",
        x,
        z,
        cabin.width ?? 1.5,
        cabin.depth ?? 1.5,
        cabinClearance,
        cabin.rotationY ?? 0
      )
    );
  }

  // Counters (detailliert)
  const countersDetailed = modules.countersDetailed ?? [];
  countersDetailed.forEach((ctr) => {
    const variant = ctr.variant ?? (modules.counterVariant ?? "basic");
    const dims = resolveCounterSize(variant, ctr.size);
    const w = dims.w;
    const d = dims.d;
    const x = ctr.position?.x ?? 0;
    const z = ctr.position?.z ?? 0;
    const ctrClearance = resolve("counter", ctr.clearance);
    const colliders = variant === "corner" ? cornerCounterColliders(w, d) : [];
    boxes.push(makeObb(`ctr-d-${ctr.id}`, "Counter", x, z, w, d, ctrClearance, ctr.rotationY ?? 0, colliders));
  });

  // Screens (nur detailliert)
  const detailedScreens = modules.detailedScreens ?? [];

  detailedScreens.forEach((scr) => {
    const w = scr.size?.w ?? 0.9;
    const t = scr.size?.t ?? 0.02;
    const mount = scr.mount ?? "wall";
    const wallSide = scr.wallSide ?? "back";
    const x = scr.position?.x ?? 0;
    const z = scr.position?.z ?? 0;
    const scrClearance = resolve("screen", scr.clearance);
    const role: CollisionRole = mount === "wall" && !scr.floating ? "wall-attachment" : "floor";

    // Wall-Mount => Breite folgt Wand, Tiefe minimal
    if (mount === "wall") {
      const rot =
        wallSide === "left" ? Math.PI / 2 : wallSide === "right" ? -Math.PI / 2 : 0;
      boxes.push(makeObb(`scr-d-${scr.id}`, "Screen", x, z, w, t || 0.05, scrClearance, rot, [], role));
      return;
    }

    const depth = mount === "floor" ? t || 0.1 : w * 0.25;
    boxes.push(
      makeObb(`scr-d-${scr.id}`, "Screen", x, z, w, depth, scrClearance, scr.rotationY ?? 0, [], role)
    );
  });

  // Sitzmoebel
  const chairs = (modules.chairsDetailed ?? []) as ChairConfig[];
  chairs.forEach((chair, idx) => {
    const type = chair.type ?? "chair";
    const dims = resolveSeatingGeometry(type, chair.footprint, chair.seatHeight, chair.backHeight);
    const x = chair.position?.x ?? 0;
    const z = chair.position?.z ?? 0;
    const chairClearance = resolve("chair", chair.clearance);
    boxes.push(
      makeObb(
        `seat-${chair.id ?? idx}`,
        "Sitzmoebel",
        x,
        z,
        dims.w,
        dims.d,
        chairClearance,
        chair.rotationY ?? 0,
        []
      )
    );
  });

  // Custom 3D-Objekte
  const customObjects = modules.customObjects ?? [];
  customObjects.forEach((obj, idx) => {
    const w = Math.max(0, obj.footprint?.w ?? 1);
    const d = Math.max(0, obj.footprint?.d ?? 1);
    const x = obj.position?.x ?? 0;
    const z = obj.position?.z ?? 0;
    const rot = obj.rotationY ?? 0;
    const customClearance = resolve("custom", (obj as { clearance?: number }).clearance);
    boxes.push(makeObb(`custom-${obj.id ?? idx}`, obj.name ?? "Custom 3D", x, z, w, d, customClearance, rot));
  });

  // Truss-Stuetzen (vier Eck-Pfosten)
  if (modules.truss) {
    const columnSize = 0.12; // etwas groesser als die optischen 8 cm
    const offsetX = modules.trussOffset?.x ?? 0;
    const offsetZ = modules.trussOffset?.z ?? 0;
    const trussClearance = resolve("truss", (modules as { trussClearance?: number }).trussClearance);

    const positions: [string, number, number][] = [
      ["truss-col-front-left", -cfg.width / 2 + offsetX, cfg.depth / 2 + offsetZ],
      ["truss-col-front-right", cfg.width / 2 + offsetX, cfg.depth / 2 + offsetZ],
      ["truss-col-back-left", -cfg.width / 2 + offsetX, -cfg.depth / 2 + offsetZ],
      ["truss-col-back-right", cfg.width / 2 + offsetX, -cfg.depth / 2 + offsetZ],
    ];

    positions.forEach(([id, x, z]) => {
      boxes.push(makeObb(id, "Truss-Stuetze", x, z, columnSize, columnSize, trussClearance));
    });
  }

  return boxes;
}
