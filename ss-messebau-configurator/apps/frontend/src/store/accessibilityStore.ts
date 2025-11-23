// Shared accessibility settings (contrast + a11y toggles)
import { create } from "zustand";

type ContrastMode = "auto" | "standard" | "high";
type EffectiveContrast = "standard" | "high";

type AccessibilityState = {
  contrastMode: ContrastMode;
  prefersHighContrast: boolean;
  setContrastMode: (mode: ContrastMode) => void;
  setPrefersHighContrast: (prefers: boolean) => void;
  toggleHighContrast: () => void;
};

const STORAGE_KEY = "ss-contrast-mode";

const readInitialContrast = (): ContrastMode => {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ContrastMode | null;
    if (stored === "standard" || stored === "high") return stored;
    return "auto";
  } catch {
    return "auto";
  }
};

const persistContrast = (mode: ContrastMode) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore write errors (private mode, disabled storage, etc.) */
  }
};

export const resolveEffectiveContrast = (
  mode: ContrastMode,
  prefersHigh: boolean
): EffectiveContrast => {
  if (mode === "high") return "high";
  if (mode === "standard") return "standard";
  return prefersHigh ? "high" : "standard";
};

export const useAccessibilityStore = create<AccessibilityState>()((set, get) => ({
  contrastMode: readInitialContrast(),
  prefersHighContrast: false,
  setContrastMode: (mode) => {
    set({ contrastMode: mode });
    persistContrast(mode);
  },
  setPrefersHighContrast: (prefers) => set({ prefersHighContrast: prefers }),
  toggleHighContrast: () => {
    const next = get().contrastMode === "high" ? "standard" : "high";
    set({ contrastMode: next });
    persistContrast(next);
  },
}));
