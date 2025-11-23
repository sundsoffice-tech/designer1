type SizeLimit = {
  min: number;
  max: number;
};

type SizeLimitWithDefault = SizeLimit & {
  default: number;
};

export const clampDimension = (
  value: number | undefined,
  limits: SizeLimit,
  fallback: number
): number => {
  const target = value ?? fallback;
  if (Number.isNaN(target)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, target));
};

export const COUNTER_SIZE_LIMITS: {
  width: SizeLimitWithDefault;
  depth: SizeLimitWithDefault;
} = {
  width: { min: 0.6, max: 2, default: 1 },
  depth: { min: 0.4, max: 1, default: 0.55 },
};
