import SAT from "sat";
import { calculateScreenFootprint, resolveCounterSize, resolveScreenSize, } from "./objectDimensions.js";
// Geometrie-Basiswerte wie im Renderer
const WALL_THICKNESS = 0.06;
const PANEL_GAP = 0.01;
const ROT_EPSILON = 1e-3;
const LED_FRAME_DEPTH = 0.12;
const BANNER_THICKNESS = 0.04;
export const DEFAULT_CLEARANCE = 0.2;
const normalizeCounterPlacement = (placement) => {
    return placement === "center" || placement === "middle" || placement === "island" ? "center" : "front";
};
const hasRotation = (rotationY) => Math.abs(rotationY ?? 0) > ROT_EPSILON;
const rotatePoint = (x, z, rotationY) => {
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    return {
        x: x * cos - z * sin,
        z: x * sin + z * cos,
    };
};
const makeObbPolygon = (centerX, centerZ, width, depth, rotationY) => {
    const halfW = width / 2;
    const halfD = depth / 2;
    const corners = [
        rotatePoint(-halfW, -halfD, rotationY),
        rotatePoint(halfW, -halfD, rotationY),
        rotatePoint(halfW, halfD, rotationY),
        rotatePoint(-halfW, halfD, rotationY),
    ].map((p) => new SAT.Vector(p.x, p.z));
    return new SAT.Polygon(new SAT.Vector(centerX, centerZ), corners);
};
export const intersects = (a, b) => {
    const intersectsAabb = (boxA, boxB) => !(boxA.maxX <= boxB.minX || boxA.minX >= boxB.maxX || boxA.maxZ <= boxB.minZ || boxA.minZ >= boxB.maxZ);
    const partsA = (a?.colliders?.length ? a.colliders : [a]);
    const partsB = (b?.colliders?.length ? b.colliders : [b]);
    const ensurePolygon = (box) => {
        if (box.polygon)
            return box.polygon;
        const width = (box.baseWidth ?? 0) + (box.clearance ?? 0) * 2;
        const depth = (box.baseDepth ?? 0) + (box.clearance ?? 0) * 2;
        return makeObbPolygon(box.centerX, box.centerZ, width, depth, box.rotationY ?? 0);
    };
    for (const boxA of partsA) {
        for (const boxB of partsB) {
            const useObb = hasRotation(boxA.rotationY ?? 0) || hasRotation(boxB.rotationY ?? 0);
            if (!useObb) {
                if (intersectsAabb(boxA, boxB))
                    return true;
                continue;
            }
            const polyA = ensurePolygon(boxA);
            const polyB = ensurePolygon(boxB);
            if (polyA && polyB && SAT.testPolygonPolygon(polyA, polyB))
                return true;
        }
    }
    return false;
};
export const makeAabb = (id, label, x, z, width, depth, clearance = DEFAULT_CLEARANCE, rotationY = 0, colliders = []) => {
    const safeWidth = Number.isFinite(width) ? Math.abs(width) : 0;
    const safeDepth = Number.isFinite(depth) ? Math.abs(depth) : 0;
    const safeClearance = Number.isFinite(clearance) ? clearance : 0;
    const normRotation = Number.isFinite(rotationY) ? rotationY : 0;
    const useObb = hasRotation(normRotation);
    const buildBox = (centerX, centerZ, w, d, suffix) => {
        const localW = Number.isFinite(w) ? Math.abs(w) : 0;
        const localD = Number.isFinite(d) ? Math.abs(d) : 0;
        const halfW = localW / 2;
        const halfD = localD / 2;
        const cos = Math.cos(normRotation);
        const sin = Math.sin(normRotation);
        const rotatedHalfW = Math.abs(halfW * cos) + Math.abs(halfD * sin);
        const rotatedHalfD = Math.abs(halfW * sin) + Math.abs(halfD * cos);
        const paddedHalfW = rotatedHalfW + safeClearance;
        const paddedHalfD = rotatedHalfD + safeClearance;
        const polygon = useObb
            ? makeObbPolygon(centerX, centerZ, localW + safeClearance * 2, localD + safeClearance * 2, normRotation)
            : undefined;
        return {
            id: suffix ? `${id}${suffix}` : id,
            parentId: id,
            label,
            centerX,
            centerZ,
            halfWidth: paddedHalfW,
            halfDepth: paddedHalfD,
            baseWidth: localW,
            baseDepth: localD,
            clearance: safeClearance,
            rotationY: normRotation,
            minX: centerX - paddedHalfW,
            maxX: centerX + paddedHalfW,
            minZ: centerZ - paddedHalfD,
            maxZ: centerZ + paddedHalfD,
            polygon,
        };
    };
    if (colliders?.length) {
        const colliderBoxes = colliders.map((col, idx) => {
            const offset = rotatePoint(col.x ?? 0, col.z ?? 0, normRotation);
            return buildBox(x + offset.x, z + offset.z, col.width, col.depth, `::${idx}`);
        });
        const posExtentX = colliderBoxes.reduce((max, box) => Math.max(max, box.maxX - x), 0);
        const negExtentX = colliderBoxes.reduce((max, box) => Math.max(max, x - box.minX), 0);
        const posExtentZ = colliderBoxes.reduce((max, box) => Math.max(max, box.maxZ - z), 0);
        const negExtentZ = colliderBoxes.reduce((max, box) => Math.max(max, z - box.minZ), 0);
        const halfWidth = Math.max(posExtentX, negExtentX);
        const halfDepth = Math.max(posExtentZ, negExtentZ);
        const compositePolygon = useObb
            ? makeObbPolygon(x, z, safeWidth + safeClearance * 2, safeDepth + safeClearance * 2, normRotation)
            : undefined;
        return {
            id,
            label,
            centerX: x,
            centerZ: z,
            halfWidth,
            halfDepth,
            baseWidth: safeWidth,
            baseDepth: safeDepth,
            clearance: safeClearance,
            rotationY: normRotation,
            minX: x - halfWidth,
            maxX: x + halfWidth,
            minZ: z - halfDepth,
            maxZ: z + halfDepth,
            colliders: colliderBoxes,
            polygon: compositePolygon,
        };
    }
    return buildBox(x, z, safeWidth, safeDepth);
};
export const cornerCounterColliders = (width, depth) => {
    const w = Number.isFinite(width) ? Math.abs(width) : 0;
    const d = Number.isFinite(depth) ? Math.abs(depth) : 0;
    const offset = (w - d) / 2;
    return [
        { x: -offset, z: 0, width: w, depth: d },
        { x: 0, z: -offset, width: d, depth: w },
    ];
};
export const findCollision = (candidate, boxes, ignored = new Set()) => {
    for (const box of boxes) {
        if (ignored.has(box.id))
            continue;
        if (intersects(candidate, box))
            return box;
    }
    return undefined;
};
export const findCollisionForMany = (candidates, boxes, ignored = new Set()) => {
    for (const candidate of candidates) {
        const hit = findCollision(candidate, boxes, ignored);
        if (hit) {
            return { collided: true, hit, candidate };
        }
    }
    return { collided: false };
};
export function buildSceneAabbs(cfg, clearance = DEFAULT_CLEARANCE) {
    const boxes = [];
    const modules = cfg.modules;
    const mAny = modules ?? {};
    // Kabine
    const cabin = mAny.cabin;
    if (cabin && (cabin.enabled ?? mAny.storageRoom)) {
        const x = cabin.position?.x ?? -cfg.width / 2 + (cabin.width ?? 1.5) / 2 + 0.25;
        const z = cabin.position?.z ?? -cfg.depth / 2 + (cabin.depth ?? 1.5) / 2 + 0.25;
        boxes.push(makeAabb("cabin", "Kabine", x, z, cabin.width ?? 1.5, cabin.depth ?? 1.5, clearance));
    }
    // Counters (detailliert)
    const countersDetailed = (mAny.countersDetailed ?? []);
    countersDetailed.forEach((ctr) => {
        const variant = ctr.variant ??
            (mAny.counterVariant ?? "basic");
        const resolved = resolveCounterSize(variant, ctr.size);
        const colliderParts = variant === "corner" ? cornerCounterColliders(resolved.w, resolved.d) : undefined;
        const x = ctr.position?.x ?? 0;
        const z = ctr.position?.z ?? 0;
        const rotationY = typeof ctr.rotationY === "number" ? ctr.rotationY : 0;
        boxes.push(makeAabb(`ctr-d-${ctr.id}`, "Counter", x, z, resolved.w, resolved.d, clearance, rotationY, colliderParts));
    });
    // Legacy-Counter (numerische Angabe) als Blocker, falls keine detaillierten existieren
    const legacyCounters = countersDetailed.length === 0 && typeof mAny.counters === "number" ? mAny.counters : 0;
    if (legacyCounters > 0) {
        const placement = normalizeCounterPlacement(mAny.countersWall);
        const variant = mAny.counterVariant ?? "basic";
        const resolved = resolveCounterSize(variant, undefined);
        const colliderParts = variant === "corner" ? cornerCounterColliders(resolved.w, resolved.d) : undefined;
        const spacing = cfg.width / (legacyCounters + 1 || 1);
        for (let i = 0; i < legacyCounters; i++) {
            const x = -cfg.width / 2 + spacing * (i + 1);
            const z = placement === "center" ? 0 : cfg.depth / 2 - 0.5;
            boxes.push(makeAabb(`ctr-legacy-${i}`, "Counter", x, z, resolved.w, resolved.d, clearance, 0, colliderParts));
        }
    }
    // Screens (nur detailliert)
    const detailedScreens = (mAny.detailedScreens ?? []);
    detailedScreens.forEach((scr) => {
        const dims = resolveScreenSize(scr.size, scr.screenSize);
        const mount = (scr.mount ?? "wall");
        const wallSide = scr.wallSide;
        const footprint = calculateScreenFootprint(mount, dims, wallSide);
        const x = scr.position?.x ?? 0;
        const z = scr.position?.z ?? 0;
        const rotationY = typeof scr.rotationY === "number" ? scr.rotationY : 0;
        boxes.push(makeAabb(`scr-d-${scr.id}`, "Screen", x, z, footprint.w, footprint.d, clearance, rotationY));
    });
    // Legacy-Screens (numerische Angabe) blocken ebenfalls, falls keine detaillierten existieren
    const legacyScreens = detailedScreens.length === 0 && typeof mAny.screens === "number" ? mAny.screens : 0;
    if (legacyScreens > 0) {
        const side = mAny.screensWall ?? "back";
        const dims = resolveScreenSize(undefined, undefined);
        const footprint = calculateScreenFootprint("wall", dims, side);
        const backWallFrontZ = -cfg.depth / 2 + WALL_THICKNESS + PANEL_GAP;
        const leftWallInnerX = -cfg.width / 2 + WALL_THICKNESS + PANEL_GAP;
        const rightWallInnerX = cfg.width / 2 - WALL_THICKNESS - PANEL_GAP;
        if (side === "back") {
            const spacing = cfg.width / (legacyScreens + 1);
            for (let i = 0; i < legacyScreens; i++) {
                const x = -cfg.width / 2 + spacing * (i + 1);
                boxes.push(makeAabb(`scr-legacy-${i}`, "Screen", x, backWallFrontZ, footprint.w, footprint.d, clearance));
            }
        }
        else if (side === "left") {
            const spacing = cfg.depth / (legacyScreens + 1);
            for (let i = 0; i < legacyScreens; i++) {
                const z = -cfg.depth / 2 + spacing * (i + 1);
                boxes.push(makeAabb(`scr-legacy-${i}`, "Screen", leftWallInnerX, z, footprint.w, footprint.d, clearance));
            }
        }
        else {
            const spacing = cfg.depth / (legacyScreens + 1);
            for (let i = 0; i < legacyScreens; i++) {
                const z = -cfg.depth / 2 + spacing * (i + 1);
                boxes.push(makeAabb(`scr-legacy-${i}`, "Screen", rightWallInnerX, z, footprint.w, footprint.d, clearance));
            }
        }
    }
    // Rundtische / Sitztische
    const roundTables = (mAny.roundTables ?? []);
    roundTables.forEach((tbl) => {
        const diameter = tbl.diameter ?? 0.9;
        const x = tbl.position?.x ?? 0;
        const z = tbl.position?.z ?? 0;
        boxes.push(makeAabb(`table-${tbl.id}`, "Sitztisch", x, z, diameter, diameter, clearance));
    });
    const chairs = (mAny.chairsDetailed ?? []);
    chairs.forEach((chair) => {
        const w = chair.footprint?.w ?? 0.48;
        const d = chair.footprint?.d ?? 0.5;
        const x = chair.position?.x ?? 0;
        const z = chair.position?.z ?? 0;
        const rotationY = typeof chair.rotationY === "number" ? chair.rotationY : 0;
        boxes.push(makeAabb(`chair-${chair.id}`, "Stuhl", x, z, w, d, clearance, rotationY));
    });
    const customObjects = (mAny.customObjects ?? []);
    customObjects.forEach((obj) => {
        const scale = obj.scale ?? 1;
        const w = (obj.footprint?.w ?? 1) * scale;
        const d = (obj.footprint?.d ?? 1) * scale;
        const x = obj.position?.x ?? 0;
        const z = obj.position?.z ?? 0;
        const rotationY = typeof obj.rotationY === "number" ? obj.rotationY : 0;
        boxes.push(makeAabb(`custom-${obj.id}`, "Custom", x, z, w, d, clearance, rotationY));
    });
    const ledFrames = (mAny.ledFramesDetailed ?? []);
    if (ledFrames.length > 0) {
        let globalIdx = 0;
        ledFrames.forEach((frame, frameIdx) => {
            const count = Math.max(1, Number(frame.count) || 1);
            const spacing = cfg.width / (count + 1);
            const size = frame.size ?? 2.5;
            const depth = LED_FRAME_DEPTH;
            const rotationY = typeof frame.rotationY === "number" ? frame.rotationY : Math.PI;
            for (let i = 0; i < count; i++) {
                const x = frame.position?.x ?? -cfg.width / 2 + spacing * (i + 1);
                const z = frame.position?.z ?? cfg.depth / 2 - 0.25;
                const id = frame.id ?? `led-frame-${frameIdx}-${i}-${globalIdx}`;
                boxes.push(makeAabb(id, "LED-Rahmen", x, z, size, depth, clearance, rotationY));
                globalIdx += 1;
            }
        });
    }
    const seatingDetailed = (mAny.seatingDetailed ?? []);
    seatingDetailed.forEach((seat, idx) => {
        const pos = seat?.position;
        if (!pos)
            return;
        const w = seat.footprint?.w ?? 0.6;
        const d = seat.footprint?.d ?? 0.6;
        const x = pos.x ?? 0;
        const z = pos.z ?? 0;
        const rotationY = typeof seat.rotationY === "number" ? seat.rotationY : 0;
        boxes.push(makeAabb(seat.id ?? `seating-${idx}`, seat.label ?? "Sitzmoebel", x, z, w, d, clearance, rotationY));
    });
    // Truss-Stützen (vier Eck-Pfosten) + Banner
    if (mAny.truss) {
        const columnSize = 0.12; // etwas größer als die optischen 8 cm
        const offsetX = mAny.trussOffset?.x ?? 0;
        const offsetZ = mAny.trussOffset?.z ?? 0;
        const positions = [
            ["truss-col-front-left", -cfg.width / 2 + offsetX, cfg.depth / 2 + offsetZ],
            ["truss-col-front-right", cfg.width / 2 + offsetX, cfg.depth / 2 + offsetZ],
            ["truss-col-back-left", -cfg.width / 2 + offsetX, -cfg.depth / 2 + offsetZ],
            ["truss-col-back-right", cfg.width / 2 + offsetX, -cfg.depth / 2 + offsetZ],
        ];
        positions.forEach(([id, x, z]) => {
            boxes.push(makeAabb(id, "Truss-Stütze", x, z, columnSize, columnSize, clearance));
        });
        const bannersFront = mAny.trussBannersFront ?? 0;
        const bannersBack = mAny.trussBannersBack ?? 0;
        const bannersLeft = mAny.trussBannersLeft ?? 0;
        const bannersRight = mAny.trussBannersRight ?? 0;
        const bannerWidth = mAny.trussBannerWidth ?? 3;
        const bannerThickness = BANNER_THICKNESS;
        if (bannersFront > 0) {
            const spacing = cfg.width / (bannersFront + 1);
            for (let i = 0; i < bannersFront; i++) {
                const x = -cfg.width / 2 + spacing * (i + 1) + offsetX;
                const z = cfg.depth / 2 - 0.05 + offsetZ;
                boxes.push(makeAabb(`truss-banner-front-${i}`, "Truss-Banner", x, z, bannerWidth, bannerThickness, clearance, 0));
            }
        }
        if (bannersBack > 0) {
            const spacing = cfg.width / (bannersBack + 1);
            for (let i = 0; i < bannersBack; i++) {
                const x = -cfg.width / 2 + spacing * (i + 1) + offsetX;
                const z = -cfg.depth / 2 + 0.05 + offsetZ;
                boxes.push(makeAabb(`truss-banner-back-${i}`, "Truss-Banner", x, z, bannerWidth, bannerThickness, clearance, 0));
            }
        }
        if (bannersLeft > 0) {
            const spacing = cfg.depth / (bannersLeft + 1);
            for (let i = 0; i < bannersLeft; i++) {
                const z = -cfg.depth / 2 + spacing * (i + 1) + offsetZ;
                const x = -cfg.width / 2 + 0.05 + offsetX;
                boxes.push(makeAabb(`truss-banner-left-${i}`, "Truss-Banner", x, z, bannerWidth, bannerThickness, clearance, Math.PI / 2));
            }
        }
        if (bannersRight > 0) {
            const spacing = cfg.depth / (bannersRight + 1);
            for (let i = 0; i < bannersRight; i++) {
                const z = -cfg.depth / 2 + spacing * (i + 1) + offsetZ;
                const x = cfg.width / 2 - 0.05 + offsetX;
                boxes.push(makeAabb(`truss-banner-right-${i}`, "Truss-Banner", x, z, bannerWidth, bannerThickness, clearance, -Math.PI / 2));
            }
        }
    }
    return boxes;
}
