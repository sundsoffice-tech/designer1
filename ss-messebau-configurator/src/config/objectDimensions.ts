import type { CounterVariant, ScreenSize, SeatingType, WallSide } from "../lib/pricing";
import { COUNTER_SIZE_LIMITS, clampDimension } from "./sizeLimits";

export const COUNTER_DIMENSIONS: Record<CounterVariant, { w: number; d: number; h: number }> =
  {
    basic: { w: 1, d: 0.55, h: 1.05 },
    premium: { w: 1.5, d: 0.62, h: 1.1 },
    corner: { w: 1.5, d: 0.62, h: 1.1 },
  };

export const SCREEN_DIMENSIONS: Record<ScreenSize, { w: number; h: number; t: number }> = {
  "55": { w: 1.23, h: 0.69, t: 0.06 },
  "65": { w: 1.45, h: 0.82, t: 0.065 },
  "75": { w: 1.6, h: 0.9, t: 0.055 },
};

export const DEFAULT_SCREEN_SIZE: ScreenSize = "55";
/** Realistische Grundtiefe fuer einen Bodenstandfuss */
export const FLOOR_SCREEN_BASE_DEPTH = 0.4;

export const SEATING_DIMENSIONS: Record<
  SeatingType,
  { footprint: { w: number; d: number }; seatHeight: number; backHeight: number }
> = {
  chair: {
    footprint: { w: 0.48, d: 0.5 },
    seatHeight: 0.46,
    backHeight: 0.92,
  },
  barstool: {
    footprint: { w: 0.44, d: 0.44 },
    seatHeight: 0.78,
    backHeight: 1.05,
  },
  lounge: {
    footprint: { w: 0.78, d: 0.82 },
    seatHeight: 0.42,
    backHeight: 0.78,
  },
};

export const resolveSeatingGeometry = (
  type?: SeatingType,
  footprint?: { w?: number; d?: number },
  seatHeight?: number,
  backHeight?: number
) => {
  const key = type ?? "chair";
  const preset = SEATING_DIMENSIONS[key] ?? SEATING_DIMENSIONS.chair;
  return {
    w: footprint?.w ?? preset.footprint.w,
    d: footprint?.d ?? preset.footprint.d,
    seatHeight: seatHeight ?? preset.seatHeight,
    backHeight: backHeight ?? preset.backHeight,
  };
};

export const resolveCounterSize = (
  variant: CounterVariant = "basic",
  size?: { w?: number; d?: number; h?: number }
) => {
  const base = COUNTER_DIMENSIONS[variant] ?? COUNTER_DIMENSIONS.basic;
  const width = clampDimension(size?.w, COUNTER_SIZE_LIMITS.width, base.w);
  const depth = clampDimension(size?.d, COUNTER_SIZE_LIMITS.depth, base.d);
  const height = typeof size?.h === "number" && !Number.isNaN(size.h) ? size.h : base.h;
  return {
    variant,
    w: width,
    d: depth,
    h: height,
  };
};

export const resolveScreenSize = (
  size?: { w?: number; h?: number; t?: number },
  screenSize?: ScreenSize
) => {
  const base =
    (screenSize && SCREEN_DIMENSIONS[screenSize]) || SCREEN_DIMENSIONS[DEFAULT_SCREEN_SIZE];
  return {
    w: size?.w ?? base.w,
    h: size?.h ?? base.h,
    t: size?.t ?? base.t,
  };
};

export const calculateScreenFootprint = (
  mount: "wall" | "truss" | "floor" | undefined,
  dims: { w: number; h: number; t: number },
  wallSide?: WallSide
) => {
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
