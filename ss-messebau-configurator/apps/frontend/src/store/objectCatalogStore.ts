import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  CounterConfig,
  CounterVariant,
  ScreenConfig,
  ScreenSize,
  CustomObjectConfig,
  WallSide,
} from "../lib/pricing";
import {
  COUNTER_DIMENSIONS,
  DEFAULT_SCREEN_SIZE,
  SCREEN_DIMENSIONS,
  resolveCounterSize,
  resolveScreenSize,
} from "../config/objectDimensions";

export type ObjectKind = "counter" | "screen" | "custom";

export type ObjectTemplate = {
  id: string;
  name: string;
  kind: ObjectKind;
  description?: string;
  category?: string;
  price?: number;
  /** Optional: eingebettete 3D-Datei (z. B. GLB/GLTF) als Data-URL */
  assetDataUrl?: string;
  assetFileName?: string;
  defaultScale?: number;
  footprint?: { width?: number; depth?: number; height?: number };
  variant?: CounterVariant;
  screenSize?: ScreenSize;
  defaults?: {
    withPower?: boolean;
    mount?: ScreenConfig["mount"];
    wallSide?: WallSide;
    heightFromFloor?: number;
  };
  dimensions?: {
    width: number;
    depth: number;
    height?: number;
    thickness?: number;
  };
  metadata?: Record<string, string | number | boolean | undefined>;
};

type CatalogState = {
  templates: Record<string, ObjectTemplate>;
  addTemplate: (tpl: Omit<ObjectTemplate, "id"> & { id?: string }) => ObjectTemplate;
  updateTemplate: (id: string, patch: Partial<ObjectTemplate>) => void;
  removeTemplate: (id: string) => void;
  resetToDefaults: () => void;
};

const STORAGE_KEY = "ss-object-catalog";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toRecord = (list: ObjectTemplate[]) =>
  list.reduce<Record<string, ObjectTemplate>>((acc, tpl) => {
    acc[tpl.id] = tpl;
    return acc;
  }, {});

const counterBasic = COUNTER_DIMENSIONS.basic;
const counterPremium = COUNTER_DIMENSIONS.premium;
const counterCorner = COUNTER_DIMENSIONS.corner;
const defaultScreenDims = SCREEN_DIMENSIONS[DEFAULT_SCREEN_SIZE];

export const DEFAULT_OBJECT_TEMPLATES: ObjectTemplate[] = [
  {
    id: "counter-basic",
    name: "Basic Tresen",
    kind: "counter",
    category: "Tresen - Gerade",
    description: "Gerader Basis-Tresen",
    variant: "basic",
    price: 220,
    dimensions: { width: counterBasic.w, depth: counterBasic.d, height: counterBasic.h },
    defaults: { withPower: false },
  },
  {
    id: "counter-premium",
    name: "Premium Tresen",
    kind: "counter",
    category: "Tresen - Premium",
    description: "Breiter Thekenblock mit Akzentlinie",
    variant: "premium",
    price: 340,
    dimensions: { width: counterPremium.w, depth: counterPremium.d, height: counterPremium.h },
    defaults: { withPower: true },
  },
  {
    id: "counter-corner",
    name: "Eck-Tresen",
    kind: "counter",
    category: "Tresen - Eck",
    description: "L-Form, ideal fuer Ecke / Kopfstand",
    variant: "corner",
    price: 280,
    dimensions: { width: counterCorner.w, depth: counterCorner.d, height: counterCorner.h },
    defaults: { withPower: true },
  },
  {
    id: "screen-55",
    name: "Screen 55\" Wand",
    kind: "screen",
    category: "Screens - Wand",
    description: "Wandmontage, Standardhoehe 1,60 m",
    screenSize: DEFAULT_SCREEN_SIZE,
    price: 250,
    dimensions: {
      width: defaultScreenDims.w,
      depth: defaultScreenDims.t,
      height: defaultScreenDims.h,
      thickness: defaultScreenDims.t,
    },
    defaults: { mount: "wall", wallSide: "back", heightFromFloor: 1.6 },
  },
];

const getInitialTemplates = () => toRecord(DEFAULT_OBJECT_TEMPLATES);

export const useObjectCatalogStore = create<CatalogState>()(
  persist(
    (set) => ({
      templates: getInitialTemplates(),
      addTemplate: (tpl) => {
        const id = tpl.id?.trim() || slugify(tpl.name || "objekt");
        const next: ObjectTemplate = { ...tpl, id };
        set((state) => ({
          templates: {
            ...state.templates,
            [id]: next,
          },
        }));
        return next;
      },
      updateTemplate: (id, patch) =>
        set((state) => {
          const current = state.templates[id];
          if (!current) return state;
          return {
            templates: {
              ...state.templates,
              [id]: { ...current, ...patch, id },
            },
          };
        }),
      removeTemplate: (id) =>
        set((state) => {
          const clone = { ...state.templates };
          delete clone[id];
          return { templates: clone };
        }),
      resetToDefaults: () => set({ templates: getInitialTemplates() }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);

export const templateToCounterConfig = (
  tpl: ObjectTemplate,
  position: { x: number; z: number }
): CounterConfig => {
  const variant = tpl.variant ?? "basic";
  const resolvedSize = resolveCounterSize(
    variant,
    tpl.dimensions
      ? {
          w: tpl.dimensions.width,
          d: tpl.dimensions.depth,
          h: tpl.dimensions.height,
        }
      : undefined
  );
  return {
    id: `ctr-${tpl.id}-${Date.now()}`,
    templateId: tpl.id,
    variant,
    withPower: tpl.defaults?.withPower ?? false,
    size: {
      w: resolvedSize.w,
      d: resolvedSize.d,
      h: resolvedSize.h,
    },
    unitPrice: tpl.price,
    position,
  };
};

export const templateToScreenConfig = (
  tpl: ObjectTemplate,
  position: { x: number; z: number }
): ScreenConfig => {
  const resolvedSize = resolveScreenSize(
    tpl.dimensions
      ? {
          w: tpl.dimensions.width,
          h: tpl.dimensions.height,
          t: tpl.dimensions.thickness ?? tpl.dimensions.depth,
        }
      : undefined,
    tpl.screenSize
  );
  const thickness = tpl.dimensions?.thickness ?? tpl.dimensions?.depth ?? resolvedSize.t;
  return {
    id: `scr-${tpl.id}-${Date.now()}`,
    templateId: tpl.id,
    screenSize: tpl.screenSize,
    size: { w: resolvedSize.w, h: resolvedSize.h, t: thickness },
    mount: tpl.defaults?.mount ?? "wall",
    wallSide: tpl.defaults?.wallSide ?? "back",
    heightFromFloor: tpl.defaults?.heightFromFloor ?? 1.6,
    unitPrice: tpl.price,
    position,
  };
};

export const templateToCustomObject = (
  tpl: ObjectTemplate,
  position: { x: number; z: number }
): CustomObjectConfig => {
  return {
    id: `custom-${tpl.id}-${Date.now()}`,
    templateId: tpl.id,
    name: tpl.name,
    assetUrl: tpl.assetDataUrl ?? "",
    sourceFileName: tpl.assetFileName,
    scale: tpl.defaultScale ?? 1,
    footprint: tpl.footprint
      ? {
          w: tpl.footprint.width,
          d: tpl.footprint.depth,
          h: tpl.footprint.height,
        }
      : undefined,
    unitPrice: tpl.price,
    position: { x: position.x, z: position.z, y: 0 },
    rotationY: 0,
  };
};

