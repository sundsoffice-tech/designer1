export const COUNTER_SIZE_LIMITS = {
  min: { w: 0.6, d: 0.4, h: 0.8 },
  max: { w: 3, d: 1.4, h: 1.6 },
};

export const SCREEN_SIZE_LIMITS = {
  min: { w: 0.4, h: 0.3, t: 0.01 },
  max: { w: 4, h: 3, t: 0.25 },
};

export function clampDimension(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
