import { create } from "zustand";

import { type TrussLayout, type TrussProfile, applyGridSnap, buildAttachmentPoints } from "@ss/shared";
import { bridgeOverFront, DEFAULT_TRUSS_PROFILE, rectOverStand, uShapeFrontOpen } from "../lib/trussLayout";

export type TrussPreset = "rect" | "u-open" | "bridge";

export type TrussState = {
  layout: TrussLayout | null;
  gridSnap: number;
  profileCatalog: Record<string, TrussProfile>;
  setLayout: (layout: TrussLayout | null) => void;
  setHeight: (height: number) => void;
  setGridSnap: (gridSnap: number) => void;
  applyPreset: (
    preset: TrussPreset,
    params: { width: number; depth?: number; height?: number; mountingType?: TrussLayout["mountingType"] }
  ) => void;
  clear: () => void;
};

const DEFAULT_HEIGHT = 3.5;

const attachLayout = (layout: TrussLayout | null, gridSnap: number): TrussLayout | null => {
  if (!layout) return null;
  const snapped = applyGridSnap({ ...layout, gridSnap });
  return { ...snapped, attachments: buildAttachmentPoints(snapped) };
};

export const useTrussStore = create<TrussState>((set, get) => ({
  layout: null,
  gridSnap: 0.5,
  profileCatalog: { [DEFAULT_TRUSS_PROFILE.id]: DEFAULT_TRUSS_PROFILE },
  setLayout: (layout) => {
    const { gridSnap } = get();
    set({ layout: attachLayout(layout, gridSnap) });
  },
  setHeight: (height) =>
    set((state) => {
      if (!state.layout) return state;
      const next: TrussLayout = { ...state.layout, height };
      return { ...state, layout: attachLayout(next, state.gridSnap) };
    }),
  setGridSnap: (gridSnap) =>
    set((state) => {
      const snap = gridSnap > 0 ? gridSnap : state.gridSnap;
      return { gridSnap: snap, layout: attachLayout(state.layout, snap) };
    }),
  applyPreset: (preset, params) => {
    const snap = get().gridSnap;
    const profile = Object.values(get().profileCatalog)[0] ?? DEFAULT_TRUSS_PROFILE;
    const height = params.height ?? get().layout?.height ?? DEFAULT_HEIGHT;
    const common = { gridSnap: snap, height, profile, mountingType: params.mountingType };
    const depth = params.depth ?? params.width;
    const layout =
      preset === "u-open"
        ? uShapeFrontOpen(params.width, depth, common)
        : preset === "bridge"
        ? bridgeOverFront(params.width, common)
        : rectOverStand(params.width, depth, common);

    set({ layout: attachLayout(layout, snap) });
  },
  clear: () => set({ layout: null }),
}));
