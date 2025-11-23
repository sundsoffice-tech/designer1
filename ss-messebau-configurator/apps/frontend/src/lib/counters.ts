// src/lib/counters.ts
import type { CounterPlacement } from "./pricing";

type NormalizedCounterPlacement = "front" | "center";

/**
 * Normalizes incoming counter placement values so the 3D engine can reliably
 * position counters even if legacy values are present in saved configs.
 */
export const normalizeCounterPlacement = (
  placement?: CounterPlacement | string
): NormalizedCounterPlacement => {
  if (placement === "center" || placement === "middle" || placement === "island") {
    return "center";
  }
  return "front";
};
