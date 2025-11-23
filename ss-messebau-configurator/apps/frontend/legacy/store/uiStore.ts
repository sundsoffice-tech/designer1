// Shared UI store to bridge sidebar actions with the 3D scene.
import { create } from "zustand";

export type FocusableObject = "counter" | "screen" | "table" | "chair" | "cabin" | "truss" | "custom";

export type ConversionRequest = "legacyCounters" | "legacyScreens";

export type FocusRequest = {
  kind: FocusableObject;
  id?: string;
};

type UiState = {
  focusRequest: FocusRequest | null;
  conversionRequest: ConversionRequest | null;
  setFocusRequest: (req: FocusRequest) => void;
  clearFocusRequest: () => void;
  requestConversion: (req: ConversionRequest) => void;
  clearConversionRequest: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  focusRequest: null,
  conversionRequest: null,
  setFocusRequest: (req) => set({ focusRequest: { ...req } }),
  clearFocusRequest: () => set({ focusRequest: null }),
  requestConversion: (req) => set({ conversionRequest: req }),
  clearConversionRequest: () => set({ conversionRequest: null }),
}));
