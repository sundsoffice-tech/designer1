import { Color } from "three";

/**
 * Lighten a hex color by mixing it with white.
 * Falls back to the original value if parsing fails.
 */
export const lightenColor = (hex: string, factor = 0.2) => {
  try {
    const base = new Color(hex);
    const target = new Color("#ffffff");
    const mixed = base.clone().lerp(target, factor);
    return `#${mixed.getHexString()}`;
  } catch {
    return hex;
  }
};

