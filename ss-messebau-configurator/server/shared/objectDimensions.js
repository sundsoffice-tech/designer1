export const COUNTER_DIMENSIONS = {
    basic: { w: 1, d: 0.55, h: 1.05 },
    premium: { w: 1.5, d: 0.62, h: 1.1 },
    corner: { w: 1.5, d: 0.62, h: 1.1 },
};
export const SCREEN_DIMENSIONS = {
    "55": { w: 1.23, h: 0.69, t: 0.06 },
    "65": { w: 1.45, h: 0.82, t: 0.065 },
    "75": { w: 1.67, h: 0.95, t: 0.07 },
};
export const DEFAULT_SCREEN_SIZE = "55";
/** Realistische Grundtiefe fuer einen Bodenstandfuss */
export const FLOOR_SCREEN_BASE_DEPTH = 0.4;
export const resolveCounterSize = (variant = "basic", size) => {
    const base = COUNTER_DIMENSIONS[variant] ?? COUNTER_DIMENSIONS.basic;
    return {
        variant,
        w: size?.w ?? base.w,
        d: size?.d ?? base.d,
        h: size?.h ?? base.h,
    };
};
export const resolveScreenSize = (size, screenSize) => {
    const base = (screenSize && SCREEN_DIMENSIONS[screenSize]) || SCREEN_DIMENSIONS[DEFAULT_SCREEN_SIZE];
    return {
        w: size?.w ?? base.w,
        h: size?.h ?? base.h,
        t: size?.t ?? base.t,
    };
};
export const calculateScreenFootprint = (mount, dims, wallSide) => {
    if (mount === "wall") {
        if (wallSide === "left" || wallSide === "right") {
            return { w: dims.t, d: dims.w };
        }
        return { w: dims.w, d: dims.t };
    }
    if (mount === "floor") {
        const depth = Math.max(FLOOR_SCREEN_BASE_DEPTH, dims.w * 0.28);
        return { w: dims.w, d: depth };
    }
    // Truss/unknown: haengend, kaum Fussabdruck am Boden
    return { w: dims.w, d: Math.max(dims.t, 0.1) };
};
