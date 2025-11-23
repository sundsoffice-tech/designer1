import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { FloorType, WallSurface } from "../lib/pricing";

export type FloorMaterial = {
  id: string;
  label: string;
  baseType: FloorType;
  color?: string;
  textureUrl?: string;
  textureFileName?: string;
  roughness?: number;
  metalness?: number;
};

export type WallFinish = {
  id: string;
  label: string;
  surface: WallSurface;
  color?: string;
  textureUrl?: string;
  textureFileName?: string;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
};

export type CounterFinish = {
  id: string;
  label: string;
  color?: string;
  accentColor?: string;
  topColor?: string;
  roughness?: number;
  metalness?: number;
};

export type MaterialPalette = {
  floors: FloorMaterial[];
  walls: WallFinish[];
  counters: CounterFinish[];
};

type MaterialState = {
  palette: MaterialPalette;
  setPalette: (palette: MaterialPalette) => void;
  mergePalette: (partial: Partial<MaterialPalette>) => MaterialPalette;
  importFromJson: (raw: string) => { success: boolean; message: string };
  addFloorMaterial: (tpl: Omit<FloorMaterial, "id"> & { id?: string }) => FloorMaterial;
  addWallFinish: (tpl: Omit<WallFinish, "id"> & { id?: string }) => WallFinish;
  addCounterFinish: (tpl: Omit<CounterFinish, "id"> & { id?: string }) => CounterFinish;
  updateFloorMaterial: (id: string, patch: Partial<FloorMaterial>) => void;
  updateWallFinish: (id: string, patch: Partial<WallFinish>) => void;
  updateCounterFinish: (id: string, patch: Partial<CounterFinish>) => void;
  removeMaterial: (kind: "floor" | "wall" | "counter", id: string) => void;
  reset: () => void;
};

const STORAGE_KEY = "ss-material-palette";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const mergeById = <T extends { id: string }>(base: T[], incoming?: T[]): T[] => {
  if (!incoming || incoming.length === 0) return base;
  const map = new Map<string, T>();
  base.forEach((item) => map.set(item.id, item));
  incoming.forEach((item) => map.set(item.id, { ...map.get(item.id), ...item }));
  return Array.from(map.values());
};

export const DEFAULT_MATERIAL_PALETTE: MaterialPalette = {
  floors: [
    {
      id: "carpet-graphite",
      label: "Teppich Graphit",
      baseType: "carpet",
      color: "#1f2937",
      roughness: 0.98,
      metalness: 0.05,
    },
    {
      id: "vinyl-concrete",
      label: "Vinyl Beton",
      baseType: "vinyl",
      color: "#374151",
      roughness: 0.65,
      metalness: 0.12,
    },
    {
      id: "wood-oak",
      label: "Holz Eiche",
      baseType: "wood",
      color: "#b58963",
      roughness: 0.7,
      metalness: 0.1,
    },
  ],
  walls: [
    {
      id: "seg-soft-gray",
      label: "SEG Soft Grau",
      surface: "seg",
      color: "#e5e7eb",
      roughness: 0.9,
    },
    {
      id: "wood-walnut",
      label: "Holz Nussbaum",
      surface: "wood",
      color: "#8b5a2b",
      roughness: 0.82,
      metalness: 0.08,
    },
    {
      id: "banner-anthracite",
      label: "Banner Anthrazit",
      surface: "banner",
      color: "#1f2937",
      roughness: 0.5,
      metalness: 0.25,
    },
    {
      id: "led-deepblue",
      label: "LED Deep Blue",
      surface: "led",
      color: "#0f172a",
      emissive: "#38bdf8",
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.2,
    },
  ],
  counters: [
    {
      id: "counter-white",
      label: "Theke Weiss",
      color: "#f9fafb",
      accentColor: "#e0e7ff",
      topColor: "#f3f4f6",
      roughness: 0.35,
      metalness: 0.45,
    },
    {
      id: "counter-black",
      label: "Theke Schwarz Matt",
      color: "#111827",
      accentColor: "#1f2937",
      topColor: "#e5e7eb",
      roughness: 0.38,
      metalness: 0.5,
    },
    {
      id: "counter-wood",
      label: "Theke Holz / Messing",
      color: "#8b5a2b",
      accentColor: "#b45309",
      topColor: "#f3f4f6",
      roughness: 0.6,
      metalness: 0.12,
    },
  ],
};

export const useMaterialStore = create<MaterialState>()(
  persist(
    (set, get) => ({
      palette: DEFAULT_MATERIAL_PALETTE,
      setPalette: (palette) => set({ palette }),
      mergePalette: (partial) => {
        const current = get().palette;
        const merged: MaterialPalette = {
          floors: mergeById(current.floors, partial.floors ?? []),
          walls: mergeById(current.walls, partial.walls ?? []),
          counters: mergeById(current.counters, partial.counters ?? []),
        };
        set({ palette: merged });
        return merged;
      },
      importFromJson: (raw) => {
        try {
          const parsed = JSON.parse(raw) as Partial<MaterialPalette>;
          const merged = get().mergePalette(parsed);
          const msg = `Palette übernommen (${merged.floors.length} Böden, ${merged.walls.length} Wand-Finishes, ${merged.counters.length} Theken-Finishes)`;
          return { success: true, message: msg };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            message: `Konnte Datei nicht lesen: ${message}`,
          };
        }
      },
      addFloorMaterial: (tpl) => {
        const id = tpl.id?.trim() || slugify(tpl.label || "boden");
        const next: FloorMaterial = { ...tpl, id };
        set((state) => ({
          palette: { ...state.palette, floors: mergeById(state.palette.floors, [next]) },
        }));
        return next;
      },
      addWallFinish: (tpl) => {
        const id = tpl.id?.trim() || slugify(tpl.label || "wand");
        const next: WallFinish = { ...tpl, id };
        set((state) => ({
          palette: { ...state.palette, walls: mergeById(state.palette.walls, [next]) },
        }));
        return next;
      },
      addCounterFinish: (tpl) => {
        const id = tpl.id?.trim() || slugify(tpl.label || "theke");
        const next: CounterFinish = { ...tpl, id };
        set((state) => ({
          palette: { ...state.palette, counters: mergeById(state.palette.counters, [next]) },
        }));
        return next;
      },
      updateFloorMaterial: (id, patch) =>
        set((state) => ({
          palette: {
            ...state.palette,
            floors: state.palette.floors.map((f) => (f.id === id ? { ...f, ...patch } : f)),
          },
        })),
      updateWallFinish: (id, patch) =>
        set((state) => ({
          palette: {
            ...state.palette,
            walls: state.palette.walls.map((f) => (f.id === id ? { ...f, ...patch } : f)),
          },
        })),
      updateCounterFinish: (id, patch) =>
        set((state) => ({
          palette: {
            ...state.palette,
            counters: state.palette.counters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          },
        })),
      removeMaterial: (kind, id) =>
        set((state) => {
          const palette = state.palette;
          if (kind === "floor") return { palette: { ...palette, floors: palette.floors.filter((f) => f.id !== id) } };
          if (kind === "wall") return { palette: { ...palette, walls: palette.walls.filter((f) => f.id !== id) } };
          return { palette: { ...palette, counters: palette.counters.filter((f) => f.id !== id) } };
        }),
      reset: () => set({ palette: DEFAULT_MATERIAL_PALETTE }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
