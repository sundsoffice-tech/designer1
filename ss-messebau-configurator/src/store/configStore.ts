// src/store/configStore.ts
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { calcPrice, calcPriceDetailed, type PriceBreakdown, type WallDetailConfig } from "../lib/pricing";
import {
  fetchRuntimePrice,
  loadRuntimeConfig,
  saveRuntimeConfig,
  validateRuntimeConfig,
  type ValidationIssue,
} from "../lib/runtimeClient";
import { loadLocalShare, rememberShareLocally } from "../lib/shareStorage";
import {
  loadModuleCatalog as loadModuleCatalogFromService,
  moduleCatalog as staticModuleCatalog,
  moduleCompatibilityIndex as staticModuleCompatibility,
  moduleVariantsByKey as staticModuleVariants,
  isCombinationAllowed,
  type ModuleSelection,
} from "../services/modules";
import type { ModuleCatalog, ModuleCompatibilityIndex, ModuleVariantMap } from "../types/modules";
import bundlePresetsData from "../data/bundles.json";
import type {
  StandConfig,
  StandType,
  WallSide,
  WallConfig,
  CabinConfig,
  StandModules,
  TrussLightConfig,
  WallLightConfig,
  ScreenConfig,
  CounterConfig,
  ChairConfig,
  RoundTableConfig,
  WallAttachmentIndex,
} from "../lib/pricing";
import { normalizeWallPanels } from "../lib/wallPanels";
import { calculateScreenFootprint, resolveScreenSize } from "../config/objectDimensions";
import { normalizeCounterPlacement } from "../lib/counters";

const RUNTIME_API_DISABLED = import.meta.env.VITE_DISABLE_RUNTIME === "true";
const DEFAULT_CUSTOMER_ID = import.meta.env.VITE_CUSTOMER_ID;
const customerPricing = DEFAULT_CUSTOMER_ID
  ? { customerId: String(DEFAULT_CUSTOMER_ID) }
  : undefined;
const CONFIG_STORAGE_KEY = "ss-config-state";
const DEFAULT_HISTORY_LIMIT = 20;

type BasePresetName = "small" | "medium" | "premium";
type BundlePresetName = "starterBundle" | "proBundle" | "premiumBundle";
type PresetName = BasePresetName | BundlePresetName;

/** Rekursives Partial fÃ¼r verschachtelte Patches (auch Arrays) */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[K] extends object
    ? DeepPartial<T[K]>
    : T[K];
};

/** setConfig-Input: erlaubt DeepPartial bei modules */
export type ConfigPatch = Omit<Partial<StandConfig>, "modules"> & {
  modules?: DeepPartial<StandModules>;
};

type SetConfigOptions = {
  skipHistory?: boolean;
};

/** Optionale Kabinen-Position im Store */
type CabinWithPosition = CabinConfig & {
  position?: { x?: number; z?: number };
};

/** WandoberflÃ¤chen (UI/3D-spezifisch) */
type WallSurface = "system" | "wood" | "banner" | "seg" | "led";

type BundlePresetDefinition = {
  key: BundlePresetName;
  label: string;
  description?: string;
  discount: number;
  config: StandConfig;
};

/** Store-State + Actions */
type ConfigState = {
  config: StandConfig;
  price: number;
  priceBreakdown: PriceBreakdown | null;
  pricePending: boolean;
  validationPending: boolean;
  validationIssues: ValidationIssue[];
  runtimeError: string | null;
  lastRuntimeSync?: number;
  moduleCatalog: ModuleCatalog;
  moduleVariants: ModuleVariantMap;
  moduleCompatibility: ModuleCompatibilityIndex;
  compatibilityIssues: string[];

  /** Undo/Redo-Stacks (intern, nÃ¼tzlich z. B. fÃ¼r Buttons) */
  history: StandConfig[];
  future: StandConfig[];
  historyLimit: number;

  /** Generische Haupt-API */
  setConfig: (partial: ConfigPatch, options?: SetConfigOptions) => void;
  checkpoint: () => void;
  applyPreset: (preset: PresetName) => void;
  replaceConfig: (next: StandConfig) => void;
  reset: () => void;
  refreshRuntime: () => void;
  saveRemoteConfig: () => Promise<{ id: string; expiresAt?: number } | null>;
  saveShareableConfig: () => Promise<
    { id: string; source: "remote" | "local"; expiresAt?: number } | null
  >;
  loadRemoteConfig: (id: string) => Promise<boolean>;
  refreshModuleCatalog: () => Promise<void>;

  /** Module gezielt patchen / setzen (DeepPartial-sicher) */
  patchModules: (partial: DeepPartial<StandModules>) => void;
  setModule: <K extends keyof StandModules>(
    key: K,
    value: DeepPartial<StandModules[K]>
  ) => void;

  /** Kabinen-Helfer */
  setCabinPosition: (x: number, z: number) => void;
  nudgeCabin: (dx: number, dz: number) => void;
  setCabinSize: (width: number, depth: number) => void;

  /** Wanddetail-Helfer */
  setWallSurface: (side: WallSide, surface: WallSurface) => void;

  /** Undo / Redo */
  undo: () => boolean;
  redo: () => boolean;
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// feste Anzahl geschlossener Seiten pro Standtyp
const wallFixedMap: Record<StandType, number> = {
  row: 3,
  corner: 2,
  head: 1,
  island: 0,
};

function getAllowedWalls(type: StandType): WallSide[] {
  const fixed = wallFixedMap[type] ?? 0;
  const allowed: WallSide[] = [];
  if (fixed >= 1) allowed.push("back");
  if (fixed >= 2) allowed.push("left");
  if (fixed >= 3) allowed.push("right");
  return allowed;
}

const MIN_STAND_SIZE = 2;
const MAX_STAND_WIDTH = 100;
const MAX_STAND_DEPTH = 100;
const isLedWallAllowed = (modules?: StandModules) => {
  if (!modules) return false;
  const allowed = Array.isArray(staticModuleCompatibility?.ledFrame?.ledWall)
    ? staticModuleCompatibility.ledFrame!.ledWall!
    : [];
  const frames = Array.isArray(modules.ledFramesDetailed) ? modules.ledFramesDetailed : [];
  if (frames.length) {
    return frames.some((f) => (f?.variant ? allowed.includes(f.variant) : false));
  }
  if (modules.frameVariant) return allowed.includes(modules.frameVariant);
  return false;
};

const counterVariantKeyMap: Record<string, string> = {
  basic: "counter_basic",
  premium: "counter_premium",
  corner: "counter_corner",
};

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const VALID_WALL_SURFACES = new Set<WallSurface>(["system", "wood", "banner", "seg", "led"]);

const screenVariantKey = (mount: string | undefined, size?: string) => {
  const s = size ?? "55";
  const m = mount ?? "wall";
  return `screen_${m}_${s}`;
};

const buildModuleSelection = (modules: StandModules): ModuleSelection => {
  const frames =
    Array.isArray(modules.ledFramesDetailed) && modules.ledFramesDetailed.length
      ? modules.ledFramesDetailed.map((f) => f.variant).filter((v): v is string => Boolean(v))
      : modules.frameVariant
      ? [modules.frameVariant]
      : [];

  const screens: ModuleSelection["screens"] =
    (modules.detailedScreens ?? []).map((scr) => ({
      key: screenVariantKey(scr.mount, scr.screenSize),
      mount: scr.mount,
    })) ?? [];

  const counters: ModuleSelection["counters"] =
    (modules.countersDetailed ?? []).map((ctr) => ({
      key: counterVariantKeyMap[ctr.variant ?? modules.counterVariant ?? "basic"] ?? "",
      withPower: ctr.withPower ?? modules.countersWithPower,
    })) ?? [];

  if ((!counters || counters.length === 0) && (modules.counters ?? 0) > 0) {
    counters.push({
      key: counterVariantKeyMap[modules.counterVariant ?? "basic"] ?? "",
      withPower: modules.countersWithPower,
    });
  }

  const features: string[] = [];
  const detail = modules.wallsDetail ?? {};
  (["back", "left", "right"] as WallSide[]).forEach((side) => {
    if (detail?.[side]?.surface === "led") features.push("ledWall");
  });
  return { frames, screens, counters, features };
};

const validateModuleSelection = (modules: StandModules): string[] => {
  const sel = buildModuleSelection(modules);
  const result = isCombinationAllowed(sel);
  return result.reasons;
};

// Walls-Objekt aus Anzahl geschlossener Seiten ableiten
function buildWalls(
  cfg: StandConfig,
  modules: StandModules,
  hasBack: boolean,
  hasLeft: boolean,
  hasRight: boolean
): Partial<Record<WallSide, WallConfig>> {
  const prev = modules.walls ?? {};
  const baseHeight = cfg.height || 2.5;

  const makeWall = (side: WallSide, closed: boolean): WallConfig => {
    const p = prev[side];
    return {
      closed,
      type: p?.type ?? "plain",
      height: p?.height ?? baseHeight,
    };
  };

  return {
    back: makeWall("back", hasBack),
    left: makeWall("left", hasLeft),
    right: makeWall("right", hasRight),
  };
}

// Kabinengroesse auf die Standflaeche begrenzen
function clampCabinSize(
  cfg: StandConfig,
  cabin: CabinWithPosition
): { width: number; depth: number } {
  const minSize = 1;
  const width = Math.min(cfg.width, Math.max(minSize, cabin.width || 1.5));
  const depth = Math.min(cfg.depth, Math.max(minSize, cabin.depth || 1.5));
  return { width, depth };
}

// Kabinen-Position immer innerhalb der Standflaeche halten
function clampCabinPosition(
  cfg: StandConfig,
  cabin: CabinWithPosition
): { x: number; z: number } {
  const standHalfX = cfg.width / 2;
  const standHalfZ = cfg.depth / 2;

  const { width: safeWidth, depth: safeDepth } = clampCabinSize(cfg, cabin);

  const cabinHalfX = safeWidth / 2;
  const cabinHalfZ = safeDepth / 2;

  const minX = -standHalfX + cabinHalfX;
  const maxX = standHalfX - cabinHalfX;
  const minZ = -standHalfZ + cabinHalfZ;
  const maxZ = standHalfZ - cabinHalfZ;

  // Default: hinten links, mit 0.25 m Abstand zu den WÃ¤nden
  const defaultX = -standHalfX + cabinHalfX + 0.25;
  const defaultZ = -standHalfZ + cabinHalfZ + 0.25;

  const rawX = cabin.position?.x ?? defaultX;
  const rawZ = cabin.position?.z ?? defaultZ;

  const x = Math.min(maxX, Math.max(minX, rawX));
  const z = Math.min(maxZ, Math.max(minZ, rawZ));

  return { x, z };
}

function clampStandPosition(
  cfg: Pick<StandConfig, "width" | "depth">,
  pos: { x?: number; z?: number },
  halfW = 0,
  halfD = 0
): { x: number; z: number } {
  const safeHalfW = Number.isFinite(halfW) ? Math.max(0, halfW) : 0;
  const safeHalfD = Number.isFinite(halfD) ? Math.max(0, halfD) : 0;
  const minX = -cfg.width / 2 + safeHalfW;
  const maxX = cfg.width / 2 - safeHalfW;
  const minZ = -cfg.depth / 2 + safeHalfD;
  const maxZ = cfg.depth / 2 - safeHalfD;
  const rawX = Number(pos?.x);
  const rawZ = Number(pos?.z);
  return {
    x: clampNumber(Number.isFinite(rawX) ? rawX : 0, minX, maxX),
    z: clampNumber(Number.isFinite(rawZ) ? rawZ : 0, minZ, maxZ),
  };
}

function sanitizeWallDetail(
  detail: StandModules["wallsDetail"],
  allowedWalls: WallSide[]
): StandModules["wallsDetail"] | undefined {
  if (!detail) return detail;
  const allowed = new Set<WallSide>(allowedWalls);
  const cleaned: NonNullable<StandModules["wallsDetail"]> = {};
  allowed.forEach((side) => {
    const entry = detail[side];
    if (!entry) return;
    const heightRaw = Number(entry.height);
    const height = Number.isFinite(heightRaw) ? Math.max(0, heightRaw) : undefined;
    const surface =
      entry.surface && VALID_WALL_SURFACES.has(entry.surface) ? (entry.surface as WallSurface) : undefined;
    const finishId = entry.finishId;
    if (surface || height !== undefined || finishId !== undefined) {
      cleaned[side] = { ...entry, surface, height, finishId };
    }
  });
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function clampFloorScreensToStand(
  cfg: Pick<StandConfig, "width" | "depth">,
  screens?: ScreenConfig[]
): ScreenConfig[] | undefined {
  if (!Array.isArray(screens)) return screens;
  let changed = false;
  const clamped = screens.map((scr) => {
    if ((scr.mount ?? "wall") !== "floor") return scr;
    const dims = resolveScreenSize(scr.size, scr.screenSize);
    const footprint = calculateScreenFootprint("floor", dims, scr.wallSide);
    const halfW = Math.max(0, (footprint?.w ?? 0) / 2);
    const halfD = Math.max(0, (footprint?.d ?? 0) / 2);
    const pos = scr.position ?? { x: 0, z: 0 };
    const safePos = clampStandPosition(cfg, pos, halfW, halfD);
    if (pos.x === safePos.x && pos.z === safePos.z) return scr;
    changed = true;
    return {
      ...scr,
      position: { ...pos, ...safePos },
    };
  });
  return changed ? clamped : screens;
}

function clampWallAttachmentPosition(
  cfg: Pick<StandConfig, "width" | "depth">,
  wall: WallSide,
  pos?: { x?: number; z?: number }
): { x: number; z: number } {
  const margin = 0.2;
  const safeX = Number.isFinite(pos?.x) ? (pos?.x as number) : 0;
  const safeZ = Number.isFinite(pos?.z) ? (pos?.z as number) : 0;
  if (wall === "back") {
    return {
      x: clampNumber(safeX, -cfg.width / 2 + margin, cfg.width / 2 - margin),
      z: -cfg.depth / 2 + margin,
    };
  }
  if (wall === "left") {
    return {
      x: -cfg.width / 2 + margin,
      z: clampNumber(safeZ, -cfg.depth / 2 + margin, cfg.depth / 2 - margin),
    };
  }
  return {
    x: cfg.width / 2 - margin,
    z: clampNumber(safeZ, -cfg.depth / 2 + margin, cfg.depth / 2 - margin),
  };
}

function normalizeWallAttachments(
  cfg: Pick<StandConfig, "width" | "depth" | "height">,
  modules: StandModules,
  allowedWalls: WallSide[],
  maxScreensForSide: (side: WallSide | undefined) => number,
  previousWalls?: WallSide[]
): WallAttachmentIndex {
  const allowed = new Set<WallSide>(allowedWalls);
  const prevWalls = previousWalls ?? allowedWalls;
  const removedWalls = prevWalls.filter((w) => !allowed.has(w));
  const neutralWall = allowedWalls[0];
  const index: WallAttachmentIndex = {
    byWall: { back: [], left: [], right: [] },
    floating: [],
    neutralWall,
  };
  const register = (id: string | undefined, wall: WallSide | undefined, floating: boolean) => {
    if (!id) return;
    if (!floating && wall) {
      index.byWall[wall].push(id);
    } else {
      index.floating.push(id);
    }
  };

  if (Array.isArray(modules.detailedScreens)) {
    const capped: ScreenConfig[] = [];
    const wallCounts: Record<WallSide, number> = { back: 0, left: 0, right: 0 };
    modules.detailedScreens.forEach((scr, idx) => {
      const id = scr.id ?? `screen-${idx}`;
      const mount = scr.mount ?? "wall";
      if (mount !== "wall") {
        register(id, undefined, false);
        capped.push(scr);
        return;
      }

      const preferred = scr.lastWallSide ?? scr.wallSide ?? modules.screensWall;
      const wasFloating = Boolean(scr.floating);
      const canUsePreferred = preferred && allowed.has(preferred as WallSide);
      const detached = preferred
        ? removedWalls.includes(preferred as WallSide) || !allowed.has(preferred as WallSide)
        : !allowed.size;
      let wallSide: WallSide | undefined = canUsePreferred ? (preferred as WallSide) : neutralWall;
      let floating = detached || !wallSide;

      if (wasFloating && canUsePreferred) {
        wallSide = preferred as WallSide;
        floating = false;
      }

      const pos = wallSide ? clampWallAttachmentPosition(cfg, wallSide, scr.position) : scr.position ?? { x: 0, z: 0 };
      const next: ScreenConfig = { ...scr, wallSide, position: pos, lastWallSide: preferred as WallSide | undefined };
      if (floating) next.floating = true;
      else if ("floating" in next) delete next.floating;

      if (!floating && wallSide) {
        const cap = maxScreensForSide(wallSide);
        if (wallCounts[wallSide] >= cap) {
          next.floating = true;
          register(id, wallSide, true);
          capped.push(next);
          return;
        }
        wallCounts[wallSide] += 1;
        register(id, wallSide, false);
        capped.push(next);
        return;
      }

      register(id, wallSide, floating);
      capped.push(next);
    });
    modules.detailedScreens = clampFloorScreensToStand(cfg, capped) ?? capped;
  }

  if (Array.isArray(modules.ledFramesDetailed)) {
    const nextFrames = modules.ledFramesDetailed.map((frame, idx) => {
      const id = frame.id ?? `led-frame-${idx}`;
      const preferred = frame.wallSide ?? frame.lastWallSide;
      const wasFloating = Boolean(frame.floating);
      const canUsePreferred = preferred && allowed.has(preferred as WallSide);
      const detached = preferred
        ? removedWalls.includes(preferred as WallSide) || !allowed.has(preferred as WallSide)
        : !allowed.size;

      let wallSide: WallSide | undefined = canUsePreferred ? (preferred as WallSide) : neutralWall;
      let floating = detached || !wallSide;

      if (wasFloating && preferred && allowed.has(preferred as WallSide)) {
        wallSide = preferred as WallSide;
        floating = false;
      }

      const pos = wallSide
        ? clampWallAttachmentPosition(cfg, wallSide, frame.position)
        : frame.position ?? { x: 0, z: 0 };
      const next = {
        ...frame,
        wallSide,
        position: pos,
        lastWallSide: preferred as WallSide | undefined,
      };

      if (floating) next.floating = true;
      else if ("floating" in next) delete next.floating;

      register(id, wallSide, floating);
      return next;
    });

    modules.ledFramesDetailed = nextFrames;
  }

  return index;
}

function sanitizeTrussBanners(cfg: StandConfig, modules: StandModules) {
  const hasTruss = Boolean(modules.truss || modules.trussConfig?.enabled);
  const clampCount = (value: unknown, max: number) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return clampNumber(Math.floor(num), 0, max);
  };
  const maxFrontBack = Math.max(0, Math.floor(cfg.width / 0.8));
  const maxLeftRight = Math.max(0, Math.floor(cfg.depth / 0.8));

  if (!hasTruss) {
    modules.trussBannersFront = 0;
    modules.trussBannersBack = 0;
    modules.trussBannersLeft = 0;
    modules.trussBannersRight = 0;
  } else {
    modules.trussBannersFront = clampCount(modules.trussBannersFront, maxFrontBack);
    modules.trussBannersBack = clampCount(modules.trussBannersBack, maxFrontBack);
    modules.trussBannersLeft = clampCount(modules.trussBannersLeft, maxLeftRight);
    modules.trussBannersRight = clampCount(modules.trussBannersRight, maxLeftRight);
  }

  const maxBannerSpan = Math.max(cfg.width, cfg.depth);
  const widthValue = Number(modules.trussBannerWidth);
  const width = Number.isFinite(widthValue) ? widthValue : 3;
  modules.trussBannerWidth = clampNumber(width, 0.5, Math.max(0.5, maxBannerSpan));

  const heightValue = Number(modules.trussBannerHeight);
  const height = Number.isFinite(heightValue) ? heightValue : 1;
  modules.trussBannerHeight = clampNumber(height, 0.3, Math.max(0.3, cfg.height || 4));
}


function buildTrussLightsFromCounts(cfg: StandConfig, modules: StandModules): TrussLightConfig[] {
  const width = cfg.width;
  const depth = cfg.depth;

  const maxPerLength = (len: number) => Math.max(0, Math.floor(len * 1.5));

  const front = Math.min(modules.trussLightsFront ?? 0, maxPerLength(width));
  const back = Math.min(modules.trussLightsBack ?? 0, maxPerLength(width));
  const left = Math.min(modules.trussLightsLeft ?? 0, maxPerLength(depth));
  const right = Math.min(modules.trussLightsRight ?? 0, maxPerLength(depth));

  const lights: TrussLightConfig[] = [];

  const addSide = (side: "front" | "back" | "left" | "right", count: number) => {
    if (count <= 0) return;
    if (side === "front" || side === "back") {
      const spacing = width / (count + 1);
      for (let i = 0; i < count; i++) {
        const x = -width / 2 + spacing * (i + 1);
        const z = side === "front" ? depth / 2 - 0.04 : -depth / 2 + 0.04;
        lights.push({
          id: `truss-${side}-${i}`,
          side,
          position: { x, z },
        });
      }
      return;
    }

    const spacing = depth / (count + 1);
    for (let i = 0; i < count; i++) {
      const z = -depth / 2 + spacing * (i + 1);
      const x = side === "left" ? -width / 2 + 0.04 : width / 2 - 0.04;
      lights.push({
        id: `truss-${side}-${i}`,
        side,
        position: { x, z },
      });
    }
  };

  addSide("front", front);
  addSide("back", back);
  addSide("left", left);
  addSide("right", right);

  return lights;
}

function buildWallLightsFromCounts(
  cfg: StandConfig,
  modules: StandModules,
  hasBack: boolean,
  hasLeft: boolean,
  hasRight: boolean
): WallLightConfig[] {
  const width = cfg.width;
  const depth = cfg.depth;
  const wallHeight = cfg.height || 2.5;
  const defaultHeightFromFloor = Math.max(0.5, wallHeight - 0.3);

  const maxPerLength = (len: number) => Math.max(0, Math.floor(len * 1.5));

  const counts = {
    back: hasBack ? Math.min(modules.wallLightsBack ?? 0, maxPerLength(width)) : 0,
    left: hasLeft ? Math.min(modules.wallLightsLeft ?? 0, maxPerLength(depth)) : 0,
    right: hasRight ? Math.min(modules.wallLightsRight ?? 0, maxPerLength(depth)) : 0,
  };

  const lights: WallLightConfig[] = [];

  const addBack = (count: number) => {
    if (count <= 0) return;
    const spacing = width / (count + 1);
    for (let i = 0; i < count; i++) {
      const x = -width / 2 + spacing * (i + 1);
      lights.push({
        id: `wall-back-${i}`,
        side: "back",
        position: { x },
        heightFromFloor: defaultHeightFromFloor,
      });
    }
  };

  const addSide = (side: "left" | "right", count: number) => {
    if (count <= 0) return;
    const spacing = depth / (count + 1);
    for (let i = 0; i < count; i++) {
      const z = -depth / 2 + spacing * (i + 1);
      lights.push({
        id: `wall-${side}-${i}`,
        side,
        position: { z },
        heightFromFloor: defaultHeightFromFloor,
      });
    }
  };

  addBack(counts.back);
  addSide("left", counts.left);
  addSide("right", counts.right);

  return lights;
}

/** Sichere Deep-Merge-Funktion fÃ¼r Module (nimmt DeepPartial entgegen) */
function mergeModules(
  base: StandModules,
  patch?: DeepPartial<StandModules>
): StandModules {
  if (!patch) return base;

  // Start: Kopie des aktuellen Zustands (verhindert TS2739 bei Objekt-Literal + Spread)
  const out: StandModules = { ...base };

  // generisch alle Keys (auch unbekannte wie trussBannerImageUrl) Ã¼bernehmen
  Object.assign(out, patch as Partial<StandModules>);

  // 1) Flach patchen: bekannte einfachen Felder, auÃŸer verschachtelte Objekte
  const shallowKeys: (keyof StandModules | "trussBannerImageUrl")[] = [
    "wallsClosedSides",
    "storageRoom",
    "storageDoorSide",
    "counters",
    "countersWall",
    "countersWithPower",
    "counterVariant",
    "counterFinishId",
    "ledFrames",
    "screens",
    "screensWall",
    "truss",
    "trussLights",
    "trussLightType",
    "trussHeight",
    "trussHeightMode",
    "trussHeightOffset",
    "trussLightsFront",
    "trussLightsBack",
    "trussLightsLeft",
    "trussLightsRight",
    "wallLightsBack",
    "wallLightsLeft",
    "wallLightsRight",
    "frameVariant",
    "frameSize",
    "frameColor",
    "trussBannersFront",
    "trussBannersBack",
    "trussBannersLeft",
    "trussBannersRight",
    "trussBannerWidth",
    "trussBannerHeight",
    "trussBannerMipmaps",
    // extra Feld, das typseitig evtl. nicht in StandModules steht:
    "trussBannerImageUrl",
    "raisedFloor",
  ];

  for (const k of shallowKeys) {
    const value = patch?.[k];
    if (value !== undefined) {
      (out as any)[k] = value;
    }
  }

  // 2) floor deep-merge
  if (patch.floor) {
    out.floor = { ...(base.floor ?? {}), ...patch.floor };
  }

  // 3) cabin deep-merge (inkl. optionaler Position)
  if (patch.cabin) {
    const baseCabin =
      base.cabin as (CabinConfig & { position?: { x?: number; z?: number } }) | undefined;
    const patchCabin =
      patch.cabin as DeepPartial<CabinConfig> & { position?: { x?: number; z?: number } };
    const mergedSurfaces = {
      ...(baseCabin?.wallSurfaces ?? {}),
      ...(patchCabin?.wallSurfaces ?? {}),
    };

    const mergedCabin: CabinConfig & { position?: { x?: number; z?: number } } = {
      enabled: true,
      width: 1.5,
      depth: 1.5,
      height: 2.5,
      ...(baseCabin ?? {}),
      ...(patchCabin ?? {}),
      position: {
        ...(baseCabin?.position ?? {}),
        ...(patchCabin?.position ?? {}),
      },
      wallSurfaces: mergedSurfaces,
    } as CabinConfig & { position?: { x?: number; z?: number } };

    out.cabin = mergedCabin;
  }

  // 4) walls + wallsDetail deep-merge
  if (patch.walls) {
    out.walls = { ...(base.walls ?? {}), ...(patch.walls ?? {}) };
  }
  if (patch.wallsDetail) {
    out.wallsDetail = {
      ...(base.wallsDetail ?? {}),
      ...(patch.wallsDetail ?? {}),
    };
  }
  if (patch.wallPanelRules) {
    out.wallPanelRules = {
      ...(base.wallPanelRules ?? {}),
      ...(patch.wallPanelRules ?? {}),
    };
  }

  // 5) Arrays nur ersetzen, wenn explizit geliefert
  if (patch.detailedScreens !== undefined) {
    out.detailedScreens = patch.detailedScreens;
  }
  if (patch.countersDetailed !== undefined) {
    out.countersDetailed = patch.countersDetailed;
  }
  if (patch.chairsDetailed !== undefined) {
    out.chairsDetailed = patch.chairsDetailed;
  }
  if (patch.trussLightsDetailed !== undefined) {
    out.trussLightsDetailed = patch.trussLightsDetailed as TrussLightConfig[];
  }
  if (patch.wallLightsDetailed !== undefined) {
    out.wallLightsDetailed = patch.wallLightsDetailed as WallLightConfig[];
  }
  if (patch.wallPanels !== undefined) {
    out.wallPanels = patch.wallPanels;
  }
  if (patch.roundTables !== undefined) {
    out.roundTables = patch.roundTables;
  }
  if (patch.customObjects !== undefined) {
    out.customObjects = patch.customObjects;
  }
  if (patch.ledFramesDetailed !== undefined) {
    out.ledFramesDetailed = patch.ledFramesDetailed;
  }
  if (patch.activeBundles !== undefined) {
    const list = patch.activeBundles;
    out.activeBundles = Array.isArray(list) ? Array.from(new Set(list)) : list;
  }

  return out;
}

function normalizeConfig(cfg: StandConfig, previous?: StandConfig): StandConfig {
  const width = Math.min(MAX_STAND_WIDTH, Math.max(MIN_STAND_SIZE, cfg.width ?? MIN_STAND_SIZE));
  const depth = Math.min(MAX_STAND_DEPTH, Math.max(MIN_STAND_SIZE, cfg.depth ?? MIN_STAND_SIZE));
  const cfgClamped: StandConfig = { ...cfg, width, depth };
  const baseHeight = cfgClamped.height || 2.5;

  // feste Anzahl geschlossener W?nde je Standtyp
  const allowedWalls = getAllowedWalls(cfgClamped.type);
  const previousAllowedWalls = previous ? getAllowedWalls(previous.type) : allowedWalls;
  const maxWalls = Math.max(0, Math.min(3, allowedWalls.length));
  const rawWallsClosedValue = Number(cfgClamped.modules?.wallsClosedSides);
  const rawWallsClosed = Number.isFinite(rawWallsClosedValue) ? clampNumber(rawWallsClosedValue, 0, 3) : undefined;
  const fixedWalls = clampNumber(wallFixedMap[cfgClamped.type] ?? rawWallsClosed ?? 0, 0, 3);
  const wallsClosedSides = clampNumber(fixedWalls ?? rawWallsClosed ?? 0, 0, maxWalls);

  const modules: StandModules = {
    ...cfgClamped.modules,
    wallsClosedSides,
  };

  modules.countersWall = normalizeCounterPlacement(modules.countersWall);

  // Rahmen-Varianten (aus modules.json) validieren / normalisieren
  const compatFrames = Array.isArray(modules.ledFramesDetailed)
    ? [...modules.ledFramesDetailed].filter(Boolean)
    : [];
  if (!compatFrames.length && modules.frameVariant) {
    compatFrames.push({
      variant: modules.frameVariant,
      size: modules.frameSize,
      color: modules.frameColor,
      count: Math.max(1, modules.ledFrames ?? 1),
    });
  }

  const cleanedFrames: NonNullable<StandModules["ledFramesDetailed"]> = [];
  compatFrames.forEach((frame) => {
    const variantKey = frame?.variant;
    if (!variantKey) return;
    const def = staticModuleVariants[variantKey];
    if (!def) return;
    const size =
      Array.isArray(def.sizes) && def.sizes.length
        ? def.sizes.includes(frame.size as number)
          ? (frame.size as number)
          : def.sizes[0]
        : frame.size;
    const color =
      Array.isArray(def.colors) && def.colors.length
        ? def.colors.includes(frame.color as string)
          ? (frame.color as string)
          : def.colors[0]
        : frame.color;
    const countRaw = typeof frame.count === "number" && Number.isFinite(frame.count) ? frame.count : 1;
    const count = Math.max(1, countRaw);
    cleanedFrames.push({
      variant: variantKey,
      size,
      color,
      count,
      unitPrice: typeof frame.unitPrice === "number" ? frame.unitPrice : undefined,
    });
  });

  if (cleanedFrames.length) {
    modules.ledFramesDetailed = cleanedFrames;
    modules.frameVariant = cleanedFrames[0]?.variant;
    modules.frameSize = cleanedFrames[0]?.size;
    modules.frameColor = cleanedFrames[0]?.color;
    modules.ledFrames = cleanedFrames.reduce((sum, f) => sum + (f.count ?? 1), 0);
  } else {
    delete modules.ledFramesDetailed;
  }

  // existierende WÃ¤nde
  const hasBack = allowedWalls.includes("back");
  const hasLeft = allowedWalls.includes("left");
  const hasRight = allowedWalls.includes("right");

  // Lagerraum nur sinnvoll, wenn RÃ¼ckwand existiert
  if (!hasBack) {
    modules.storageRoom = false;
    if (modules.cabin) {
      (modules.cabin as CabinWithPosition).enabled = false;
    }
  }

  const fixWall = (wall?: WallSide): WallSide | undefined => {
    if (!allowedWalls.length) return undefined;
    if (wall && allowedWalls.includes(wall)) return wall;
    return allowedWalls[0];
  };

  const cleanedWallsDetail = sanitizeWallDetail(modules.wallsDetail, allowedWalls);
  if (cleanedWallsDetail) {
    modules.wallsDetail = cleanedWallsDetail;
  } else if (modules.wallsDetail) {
    delete modules.wallsDetail;
  }

  // Screens nur auf existierenden WÃ¤nden platzieren
  modules.screensWall = fixWall(modules.screensWall);
  const maxScreensForSide = (side?: WallSide) => {
    if (!side) return 0;
    const len = side === "back" ? cfgClamped.width : cfgClamped.depth;
    return Math.max(0, Math.floor(len / 1.2));
  };
  if (typeof modules.screens === "number") {
    modules.screens = Math.min(modules.screens, maxScreensForSide(modules.screensWall));
  }

  const wallAttachmentIndex = normalizeWallAttachments(
    cfgClamped,
    modules,
    allowedWalls,
    maxScreensForSide,
    previousAllowedWalls
  );
  modules.wallAttachmentIndex = wallAttachmentIndex;

  const accessibilityCfg = modules.accessibility ?? {};
  const safeRampLength = Math.min(
    Math.max(typeof accessibilityCfg.rampLength === "number" ? accessibilityCfg.rampLength : 1.2, 0.8),
    Math.max(cfgClamped.depth - 0.2, 0.8)
  );
  modules.accessibility = {
    barrierFree: Boolean(accessibilityCfg.barrierFree),
    rampLength: safeRampLength,
  };

  const storageActive = !!modules.storageRoom;
  const storageDoorWall =
    storageActive && allowedWalls.length
      ? fixWall(modules.storageDoorSide as WallSide | undefined) ?? allowedWalls[0]
      : undefined;
  if (storageDoorWall) {
    modules.storageDoorSide = storageDoorWall;
  } else if (!storageActive) {
    delete modules.storageDoorSide;
  }

  // --- Boden-Defaults ---
  if (!modules.floor) {
    modules.floor = {
      type: "carpet",
      raised: modules.raisedFloor ?? false,
    };
  } else if (modules.raisedFloor && !modules.floor.raised) {
    // raisedFloor-Flag mit floor.raised synchronisieren
    modules.floor.raised = true;
  }

  // --- Kabine-Defaults + Kopplung an storageRoom ---
  if (!modules.cabin) {
    modules.cabin = {
      enabled: storageActive,
      width: 1.5,
      depth: 1.5,
      height: baseHeight,
      doorSide: storageDoorWall,
    } as CabinWithPosition;
  } else {
    // KabinenhÃ¶he an StandhÃ¶he koppeln
    modules.cabin.height = baseHeight;

    const cabinDoorSide =
      storageActive && allowedWalls.length
        ? fixWall(modules.cabin.doorSide as WallSide | undefined) ?? storageDoorWall
        : undefined;
    if (cabinDoorSide) {
      modules.cabin.doorSide = cabinDoorSide;
    } else if (!storageActive) {
      delete modules.cabin.doorSide;
    }

    // Lagerraum-Flag steuert, ob Kabine aktiv ist
    (modules.cabin as CabinWithPosition).enabled = storageActive;
  }

  // Kabine positionieren (bewegbar, aber immer innerhalb der StandflÃ¤che)
  let cabin = modules.cabin as CabinWithPosition | undefined;
  if (cabin) {
    const size = clampCabinSize(cfgClamped, cabin);
    cabin = { ...cabin, ...size };
    modules.cabin = cabin;
  }

  if (cabin && cabin.enabled) {
    const pos = clampCabinPosition(cfgClamped, cabin);
    modules.cabin = {
      ...cabin,
      position: pos,
    } as CabinWithPosition;
  }

  // --- WÃ¤nde-Objekt (fÃ¼r Advanced-Pricing) aufbauen ---
  modules.walls = buildWalls(cfgClamped, modules, hasBack, hasLeft, hasRight);

  // --- Wandpaneele automatisch aus Regeln ableiten (fÃ¼r segmentierte OberflÃ¤chen) ---
  const { rules: mergedPanelRules, panels } = normalizeWallPanels(cfgClamped, modules);
  modules.wallPanelRules = mergedPanelRules;
  modules.wallPanels = panels;

  // LED-Wand nur wenn kompatible Rahmen-Variante gewaehlt wurde
  if (!isLedWallAllowed(modules)) {
    const detail: Partial<Record<WallSide, WallDetailConfig>> = {
      ...(modules.wallsDetail ?? {}),
    };
    let changed = false;
    (["back", "left", "right"] as WallSide[]).forEach((side) => {
      if (detail?.[side]?.surface === "led") {
        detail[side] = { ...(detail[side] ?? {}), surface: "seg" as WallSurface, finishId: undefined };
        changed = true;
      }
    });
    if (changed) {
      modules.wallsDetail = detail as Partial<Record<WallSide, WallDetailConfig>>;
    }
  }

  sanitizeTrussBanners(cfgClamped, modules);

  // --- Lampen-Defaults ---
  if (modules.trussLights == null) modules.trussLights = 0;
  if (modules.wallLightsBack == null) modules.wallLightsBack = 0;
  if (modules.wallLightsLeft == null) modules.wallLightsLeft = 0;
  if (modules.wallLightsRight == null) modules.wallLightsRight = 0;

  if (!Array.isArray(modules.trussLightsDetailed)) {
    modules.trussLightsDetailed = buildTrussLightsFromCounts(cfgClamped, modules);
  }
  const trussDetailedAll = (modules.trussLightsDetailed ?? []) as TrussLightConfig[];
  const maxTrussPerSide = {
    front: Math.max(0, Math.floor(cfgClamped.width * 1.5)),
    back: Math.max(0, Math.floor(cfgClamped.width * 1.5)),
    left: Math.max(0, Math.floor(cfgClamped.depth * 1.5)),
    right: Math.max(0, Math.floor(cfgClamped.depth * 1.5)),
  };
  const limitedTruss: TrussLightConfig[] = [];
  (["front", "back", "left", "right"] as const).forEach((side) => {
    const items = trussDetailedAll.filter((l) => l.side === side).slice(0, maxTrussPerSide[side]);
    limitedTruss.push(...items);
  });
  const trussDetailed = limitedTruss;
  modules.trussLightsDetailed = trussDetailed;
  const trussCounts = {
    front: trussDetailed.filter((l) => l.side === "front").length,
    back: trussDetailed.filter((l) => l.side === "back").length,
    left: trussDetailed.filter((l) => l.side === "left").length,
    right: trussDetailed.filter((l) => l.side === "right").length,
  };
  modules.trussLightsFront = trussCounts.front;
  modules.trussLightsBack = trussCounts.back;
  modules.trussLightsLeft = trussCounts.left;
  modules.trussLightsRight = trussCounts.right;
  modules.trussLights = trussCounts.front + trussCounts.back + trussCounts.left + trussCounts.right;

  if (!Array.isArray(modules.wallLightsDetailed)) {
    modules.wallLightsDetailed = buildWallLightsFromCounts(cfgClamped, modules, hasBack, hasLeft, hasRight);
  }
  const allowedWallSides = new Set<WallSide>();
  if (hasBack) allowedWallSides.add("back");
  if (hasLeft) allowedWallSides.add("left");
  if (hasRight) allowedWallSides.add("right");
  const wallCleaned = ((modules.wallLightsDetailed ?? []) as WallLightConfig[]).filter((w) =>
    allowedWallSides.has(w.side)
  );
  const maxWallLights = {
    back: Math.max(0, Math.floor(cfgClamped.width * 1.5)),
    left: Math.max(0, Math.floor(cfgClamped.depth * 1.5)),
    right: Math.max(0, Math.floor(cfgClamped.depth * 1.5)),
  };
  const limitedWallLights: WallLightConfig[] = [];
  (["back", "left", "right"] as WallSide[]).forEach((side) => {
    const items = wallCleaned.filter((w) => w.side === side).slice(0, maxWallLights[side]);
    limitedWallLights.push(...items);
  });
  modules.wallLightsDetailed = limitedWallLights;

  const wallDetailed = (modules.wallLightsDetailed ?? []) as WallLightConfig[];
  const wallCounts = {
    back: wallDetailed.filter((l) => l.side === "back").length,
    left: wallDetailed.filter((l) => l.side === "left").length,
    right: wallDetailed.filter((l) => l.side === "right").length,
  };
  modules.wallLightsBack = wallCounts.back;
  modules.wallLightsLeft = wallCounts.left;
  modules.wallLightsRight = wallCounts.right;

  // --- MÃ¶belanzahl an StandflÃ¤che koppeln ---
  const area = cfgClamped.width * cfgClamped.depth;
  const maxCountersDetailed = Math.max(1, Math.floor(area / 6));
  const maxRoundTables = Math.max(1, Math.floor(area / 6));
  const maxChairs = Math.max(2, Math.floor(area));

  if (Array.isArray(modules.countersDetailed)) {
    modules.countersDetailed = (modules.countersDetailed as CounterConfig[]).slice(0, maxCountersDetailed);
  }
  if (Array.isArray(modules.roundTables)) {
    modules.roundTables = (modules.roundTables as RoundTableConfig[]).slice(0, maxRoundTables);
  }
  if (Array.isArray(modules.chairsDetailed)) {
    modules.chairsDetailed = (modules.chairsDetailed as ChairConfig[]).slice(0, maxChairs);
  }

  return { ...cfgClamped, modules };
}

type BundlePresetRaw = {
  key: string;
  label?: string;
  name?: string;
  description?: string;
  discount?: number;
  config: StandConfig;
};

const bundlePresets: BundlePresetDefinition[] = ((bundlePresetsData as BundlePresetRaw[]) ?? []).map(
  (entry) => {
    const label = entry.label ?? entry.name ?? entry.key;
    const discount = typeof entry.discount === "number" ? entry.discount : 0;
    const configWithMeta: StandConfig = {
      ...(entry.config as StandConfig),
      bundleKey: entry.key as BundlePresetName,
      bundleLabel: label,
      bundleDiscount: discount,
    };
    return {
      key: entry.key as BundlePresetName,
      label,
      description: entry.description,
      discount,
      config: normalizeConfig(configWithMeta),
    };
  }
);

const bundlePresetMap = bundlePresets.reduce<Record<BundlePresetName, BundlePresetDefinition>>(
  (acc, preset) => {
    acc[preset.key] = preset;
    return acc;
  },
  {} as Record<BundlePresetName, BundlePresetDefinition>
);

const collectBundleVariantCounts = (modules: StandModules): Record<string, number> => {
  const counts: Record<string, number> = {};
  const add = (variant?: string, qty = 1) => {
    if (!variant) return;
    counts[variant] = (counts[variant] ?? 0) + qty;
  };

  const ledFrames = Array.isArray(modules.ledFramesDetailed)
    ? [...modules.ledFramesDetailed]
    : [];
  if (ledFrames.length === 0 && modules.frameVariant) {
    ledFrames.push({
      variant: modules.frameVariant,
      count: Math.max(1, modules.ledFrames ?? 1),
    });
  }
  ledFrames.forEach((frame) =>
    add(frame?.variant, Math.max(1, Number(frame?.count) || 1))
  );

  const countersDetailed = Array.isArray(modules.countersDetailed)
    ? (modules.countersDetailed as CounterConfig[])
    : [];
  if (countersDetailed.length > 0) {
    countersDetailed.forEach((ctr) =>
      add(counterVariantKeyMap[ctr.variant ?? modules.counterVariant ?? "basic"])
    );
  } else if ((modules.counters ?? 0) > 0) {
    const qty = Math.max(0, modules.counters ?? 0);
    const variantKey = counterVariantKeyMap[modules.counterVariant ?? "basic"];
    for (let i = 0; i < qty; i++) add(variantKey);
  }

  const screensDetailed = Array.isArray(modules.detailedScreens)
    ? (modules.detailedScreens as ScreenConfig[])
    : [];
  screensDetailed.forEach((scr) => add(screenVariantKey(scr.mount, scr.screenSize)));

  return counts;
};

const isBundleConfigMatch = (cfg: StandConfig, bundle: BundlePresetDefinition): boolean => {
  const target = bundle.config;
  if (Math.abs(cfg.width - target.width) > 0.01) return false;
  if (Math.abs(cfg.depth - target.depth) > 0.01) return false;
  if (Math.abs(cfg.height - target.height) > 0.01) return false;
  if (cfg.type !== target.type) return false;

  if (target.modules.floor) {
    const floor = cfg.modules.floor;
    if (!floor) return false;
    if (floor.type !== target.modules.floor.type) return false;
    if (!!floor.raised !== !!target.modules.floor.raised) return false;
  }

  if (target.modules.raisedFloor && !cfg.modules.raisedFloor && !cfg.modules.floor?.raised) {
    return false;
  }

  if (target.modules.cabin?.enabled) {
    const cabin = cfg.modules.cabin;
    if (!cabin?.enabled) return false;
    if ((cabin.width ?? 0) + 0.001 < (target.modules.cabin.width ?? 0)) return false;
    if ((cabin.depth ?? 0) + 0.001 < (target.modules.cabin.depth ?? 0)) return false;
  }

  const requiresTruss = target.modules.truss || target.modules.trussConfig?.enabled;
  if (requiresTruss && !(cfg.modules.truss || cfg.modules.trussConfig?.enabled)) {
    return false;
  }

  if (target.modules.wallsDetail?.back?.surface === "led") {
    const surface = (cfg.modules.wallsDetail ?? {}).back?.surface;
    if (surface !== "led") return false;
  }

  const requiredVariants = collectBundleVariantCounts(target.modules);
  const currentVariants = collectBundleVariantCounts(cfg.modules);
  for (const [variant, needed] of Object.entries(requiredVariants)) {
    if ((currentVariants[variant] ?? 0) < needed) return false;
  }

  return true;
};

const dropBundleMeta = (cfg: StandConfig): StandConfig => {
  const { bundleKey, bundleLabel, bundleDiscount, ...rest } = cfg;
  return rest as StandConfig;
};

const applyBundleGuard = (cfg: StandConfig): StandConfig => {
  const bundleKey = cfg.bundleKey as BundlePresetName | undefined;
  if (!bundleKey) return cfg;
  const preset = bundlePresetMap[bundleKey];
  if (!preset) return dropBundleMeta(cfg);
  const withMeta = {
    ...cfg,
    bundleKey: preset.key,
    bundleLabel: preset.label,
    bundleDiscount: preset.discount,
  };
  return isBundleConfigMatch(withMeta, preset) ? withMeta : dropBundleMeta(withMeta);
};

// Presets (werden mit normalizeConfig aufbereitet)
const basePresetConfigs: Record<BasePresetName, StandConfig> = {
  small: {
    width: 3,
    depth: 3,
    height: 2.5,
    type: "row",
    region: "NRW",
    rush: false,
    modules: {
      wallsClosedSides: 3,
      storageRoom: true,
      storageDoorSide: "back",
      wallsDetail: {
        back: { surface: "seg" },
        left: { surface: "seg" },
        right: { surface: "seg" },
      },
      cabin: {
        enabled: true,
        width: 1.2,
        depth: 1.1,
        height: 2.5,
        doorSide: "front",
        wallSurfaces: {
          back: "seg",
          left: "seg",
          right: "seg",
          front: "seg",
        },
        position: { x: -0.9, z: -0.95 },
      },
      counters: 1,
      countersWall: "front",
      countersWithPower: true,
      counterVariant: "premium",
      countersDetailed: [
        {
          id: "ctr-small-front",
          variant: "premium",
          withPower: true,
          size: { w: 1.1, d: 0.5, h: 1.02 },
          position: { x: 0.55, z: 1.05 },
        },
      ],
      screens: 1,
      screensWall: "back",
      detailedScreens: [
        {
          id: "scr-small-back",
          mount: "wall",
          wallSide: "back",
          size: { w: 1.2, h: 0.7, t: 0.06 },
          position: { x: 0.45, z: -1.45 },
          heightFromFloor: 1.53,
        },
      ],
      wallLightsDetailed: [],
      roundTables: [
        {
          id: "tbl-small-1",
          diameter: 0.9,
          height: 0.75,
          position: { x: 0.55, z: 0.15 },
        },
      ],
      chairsDetailed: [
        {
          id: "chair-small-1",
          type: "chair",
          cover: "none",
          position: { x: 0.55, z: -0.35 },
          rotationY: 0,
        },
        {
          id: "chair-small-2",
          type: "chair",
          cover: "none",
          position: { x: 1.05, z: 0.35 },
          rotationY: -1.2,
        },
      ],
      floor: {
        type: "laminate",
        raised: false,
      },
      truss: false,
      raisedFloor: false,
    },
  },
  medium: {
    width: 6,
    depth: 4,
    height: 2.5,
    type: "corner",
    region: "NRW",
    rush: false,
    modules: {
      wallsClosedSides: 2,
      storageRoom: true,
      storageDoorSide: "back",
      wallsDetail: {
        back: { surface: "seg" },
        left: { surface: "seg" },
      },
      cabin: {
        enabled: true,
        width: 2,
        depth: 1.6,
        height: 2.5,
        doorSide: "front",
        wallSurfaces: {
          back: "seg",
          left: "seg",
          right: "seg",
          front: "seg",
        },
        position: { x: -1.95, z: -1.15 },
      },
      counters: 1,
      countersWall: "front",
      countersWithPower: true,
      counterVariant: "premium",
      countersDetailed: [
        {
          id: "ctr-medium-front",
          variant: "premium",
          withPower: true,
          size: { w: 1.4, d: 0.6, h: 1.05 },
          position: { x: 0.3, z: 1.6 },
        },
      ],
      screens: 1,
      screensWall: "back",
      detailedScreens: [
        {
          id: "scr-medium-back-large",
          mount: "wall",
          wallSide: "back",
          size: { w: 1.6, h: 0.9, t: 0.08 },
          position: { x: 1.45, z: -1.9 },
          heightFromFloor: 1.5,
        },
      ],
      truss: true,
      trussHeight: 5,
      trussLightType: "spot",
      trussOffset: { x: 0, z: -0.1 },
      trussLightsDetailed: [
        { id: "truss-med-front-1", side: "front", position: { x: -1.8, z: 1.9 } },
        { id: "truss-med-front-2", side: "front", position: { x: 1.8, z: 1.9 } },
        { id: "truss-med-back-1", side: "back", position: { x: 1.2, z: -1.9 } },
        { id: "truss-med-left-1", side: "left", position: { x: -2.8, z: 0.5 } },
      ],
      trussBannersFront: 1,
      trussBannerWidth: 3.2,
      trussBannerHeight: 0.9,
      wallLightsDetailed: [],
      roundTables: [
        { id: "tbl-medium-1", diameter: 1, height: 0.75, position: { x: 1.25, z: 0.2 } },
      ],
      chairsDetailed: [
        {
          id: "chair-medium-1",
          type: "chair",
          cover: "none",
          position: { x: 1.25, z: -0.6 },
          rotationY: 0,
        },
        {
          id: "chair-medium-2",
          type: "chair",
          cover: "none",
          position: { x: 2.05, z: 0.2 },
          rotationY: -1.57,
        },
        {
          id: "chair-medium-3",
          type: "chair",
          cover: "none",
          position: { x: 0.55, z: 0.2 },
          rotationY: 1.57,
        },
      ],
      floor: {
        type: "vinyl",
        raised: false,
      },
      raisedFloor: false,
    },
  },
  premium: {
    width: 8,
    depth: 5,
    height: 2.5,
    type: "head",
    region: "NRW",
    rush: false,
    modules: {
      wallsClosedSides: 1,
      storageRoom: true,
      storageDoorSide: "right",
      wallsDetail: {
        back: { surface: "seg" },
      },
      cabin: {
        enabled: true,
        width: 2.4,
        depth: 2,
        height: 2.5,
        doorSide: "right",
        wallSurfaces: {
          back: "wood",
          left: "wood",
          right: "seg",
          front: "seg",
        },
        position: { x: -2.8, z: -1.5 },
      },
      counters: 1,
      countersWall: "center",
      countersWithPower: true,
      counterVariant: "premium",
      countersDetailed: [
        {
          id: "ctr-premium-front",
          variant: "premium",
          withPower: true,
          size: { w: 1.6, d: 0.65, h: 1.05 },
          position: { x: 2.2, z: 1.95 },
        },
      ],
      screens: 2,
      screensWall: "back",
      detailedScreens: [
        {
          id: "scr-premium-led",
          mount: "wall",
          wallSide: "back",
          size: { w: 3.2, h: 1.8, t: 0.15 },
          position: { x: 1.6, z: -2.4 },
          heightFromFloor: 1.35,
        },
        {
          id: "scr-premium-floor",
          mount: "floor",
          size: { w: 1.2, h: 0.75, t: 0.12 },
          position: { x: -2.6, z: 1.9 },
          rotationY: 0,
        },
      ],
      truss: true,
      trussHeight: 5.4,
      trussLightType: "wash",
      trussOffset: { x: 0, z: -0.15 },
      trussLightsDetailed: [
        { id: "truss-prem-front-1", side: "front", position: { x: -2.4, z: 2.3 } },
        { id: "truss-prem-front-2", side: "front", position: { x: 2.4, z: 2.3 } },
        { id: "truss-prem-back-1", side: "back", position: { x: -2.1, z: -2.3 } },
        { id: "truss-prem-back-2", side: "back", position: { x: 2.1, z: -2.3 } },
        { id: "truss-prem-left-1", side: "left", position: { x: -3.8, z: 0.4 } },
        { id: "truss-prem-right-1", side: "right", position: { x: 3.8, z: 0.1 } },
      ],
      trussBannersFront: 1,
      trussBannersLeft: 1,
      trussBannerWidth: 3.8,
      trussBannerHeight: 1,
      wallLightsDetailed: [],
      roundTables: [
        { id: "tbl-premium-1", diameter: 1.05, height: 0.75, position: { x: -1.2, z: 0.6 } },
        { id: "tbl-premium-2", diameter: 1.05, height: 0.75, position: { x: 1.6, z: 0.2 } },
      ],
      chairsDetailed: [
        { id: "chair-prem-1", type: "chair", cover: "none", position: { x: -1.95, z: 0.6 } },
        { id: "chair-prem-2", type: "chair", cover: "none", position: { x: -0.45, z: 0.6 } },
        { id: "chair-prem-3", type: "chair", cover: "none", position: { x: -1.2, z: 1.35 } },
        { id: "chair-prem-4", type: "chair", cover: "none", position: { x: 0.9, z: 0.2 } },
        { id: "chair-prem-5", type: "chair", cover: "none", position: { x: 2.3, z: 0.2 } },
        { id: "chair-prem-6", type: "chair", cover: "none", position: { x: 1.6, z: 0.95 } },
      ],
      floor: {
        type: "wood",
        raised: true,
      },
      raisedFloor: true,
    },
  },
};

const presetConfigs: Record<PresetName, StandConfig> = {
  ...basePresetConfigs,
  starterBundle: bundlePresetMap.starterBundle?.config ?? basePresetConfigs.small,
  proBundle: bundlePresetMap.proBundle?.config ?? basePresetConfigs.medium,
  premiumBundle: bundlePresetMap.premiumBundle?.config ?? basePresetConfigs.premium,
};

function withNormalized(cfg: StandConfig) {
  const normalized = normalizeConfig(cfg);
  return { config: normalized };
}

const initialBase = withNormalized(presetConfigs.small).config;
const initialDetailed = calcPriceDetailed(initialBase, undefined, customerPricing);
const initial = {
  config: initialBase,
  price: initialDetailed.total,
  priceBreakdown: initialDetailed.breakdown,
};

const applyFinalRef: { current?: (cfg: StandConfig) => void } = {};

function createRuntimeSync(get: () => ConfigState, set: (partial: Partial<ConfigState>) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let requestId = 0;
  let runtimeBackoffUntil = 0;
  const BACKOFF_MS = 30_000;
  let lastPrice: number | null = null;
  let lastValidationJson = "";
  let active = false;
  let queuedTarget: StandConfig | null = null;
  let hardDisabled = false;
  const computeBreakdown = (cfg: StandConfig): PriceBreakdown =>
    calcPriceDetailed(cfg, undefined, customerPricing).breakdown;

  const startBackoff = (message: string) => {
    runtimeBackoffUntil = Date.now() + BACKOFF_MS;
    return message;
  };

  const run = (cfg?: StandConfig) => {
    const target = cfg ?? get().config;

    // Wenn ein Lauf bereits aktiv ist, die neueste Konfiguration vormerken und sofort zurueckkehren
    if (active) {
      queuedTarget = target;
      return;
    }

    clearTimeout(timer);

    set({
      pricePending: true,
      validationPending: true,
      runtimeError: null,
    });

    if (RUNTIME_API_DISABLED) {
      const fallback = calcPrice(target, undefined, customerPricing);
      set({
        price: fallback,
        priceBreakdown: computeBreakdown(target),
        pricePending: false,
        validationPending: false,
        validationIssues: [],
        runtimeError: "Runtime-API deaktiviert (VITE_DISABLE_RUNTIME=true)",
        lastRuntimeSync: Date.now(),
      });
      lastPrice = fallback;
      lastValidationJson = JSON.stringify([]);
      return;
    }

    timer = setTimeout(async () => {
      if (hardDisabled) {
        const fallback = calcPrice(target, undefined, customerPricing);
        set({
          price: fallback,
          priceBreakdown: computeBreakdown(target),
          pricePending: false,
          validationPending: false,
          validationIssues: [],
          runtimeError: "Backend deaktiviert nach Verbindungsfehler (session-weit).",
          lastRuntimeSync: Date.now(),
        });
        lastPrice = fallback;
        lastValidationJson = JSON.stringify([]);
        return;
      }

      active = true;
      const currentId = ++requestId;
      let errorMessage: string | null = null;

      if (Date.now() < runtimeBackoffUntil) {
        const fallback = calcPrice(target, undefined, customerPricing);
        if (currentId === requestId) {
          set({
            price: fallback,
            priceBreakdown: computeBreakdown(target),
            pricePending: false,
            validationPending: false,
            validationIssues: [],
            runtimeError: "Backend kurzzeitig deaktiviert (Verbindungsfehler, erneuter Versuch in Kuerze)",
          });
        }
        return;
      }

      const priceOk = await (async () => {
        try {
          const price = await fetchRuntimePrice(target);
          if (currentId === requestId) {
            if (price !== lastPrice) {
              lastPrice = price;
              set({ price, priceBreakdown: computeBreakdown(target) });
            }
            set({ pricePending: false, priceBreakdown: computeBreakdown(target) });
          }
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Preis-API nicht erreichbar";
          errorMessage = startBackoff(msg);
          hardDisabled = true;
          const fallback = calcPrice(target, undefined, customerPricing);
          if (currentId === requestId) {
            lastPrice = fallback;
            set({
              price: fallback,
              priceBreakdown: computeBreakdown(target),
              pricePending: false,
              validationIssues: [],
            });
          }
          return false;
        }
      })();

      if (!priceOk) {
        if (currentId === requestId) {
          set({ validationPending: false, validationIssues: [] });
        }
        return;
      }

      await (async () => {
        try {
          const validation = await validateRuntimeConfig(target);
          if (currentId === requestId) {
            const nextIssues = validation.issues ?? [];
            const nextJson = JSON.stringify(nextIssues);
            if (nextJson !== lastValidationJson) {
              lastValidationJson = nextJson;
              set({
                validationIssues: nextIssues,
                validationPending: false,
              });
            } else {
              set({ validationPending: false });
            }
          }
        } catch (err) {
          if (!errorMessage) {
            const msg = err instanceof Error ? err.message : "Plausibilitaets-API nicht erreichbar";
            errorMessage = startBackoff(msg);
          }
          if (currentId === requestId) {
            set({ validationPending: false });
          }
        }
      })();

      if (currentId === requestId) {
        set({
          runtimeError: errorMessage,
          lastRuntimeSync: Date.now(),
        });
      }

      active = false;
      if (queuedTarget) {
        const rerun = queuedTarget;
        queuedTarget = null;
        run(rerun);
      }
    }, 180);
  };

  return run;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Store
export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => {
  /** Helper: in History pushen (mit Limit) */
  const pushHistory = () => {
    const { history, historyLimit, config } = get();
    const next = [...history, config];
    const cut =
      next.length > historyLimit ? next.slice(next.length - historyLimit) : next;
    // bei jedem neuen Schritt Future verwerfen
    set({ history: cut, future: [] });
  };

  const runtimeSync = createRuntimeSync(get, set);

  const ensureCompatibilityAllowed = () => {
    const issues = get().compatibilityIssues ?? [];
    if (issues.length > 0) {
      throw new Error(`Nicht zulÃ¤ssige Kombination: ${issues.join("; ")}`);
    }
  };

  /** Modul-Katalog aus JSON (oder Remote) laden und im State ablegen. */
  const syncModuleCatalog = async () => {
    try {
      const result = await loadModuleCatalogFromService();
      set({
        moduleCatalog: result.catalog,
        moduleVariants: result.variants,
        moduleCompatibility: result.compatibility,
      });
    } catch {
      // Lokale Fallback-Daten bleiben aktiv
    }
  };

  /** Helper: Normalize + Backend-Lauf (Preis/Plausibilitaet) */
  const applyFinal = (cfg: StandConfig, prev?: StandConfig) => {
    const normalized = normalizeConfig(cfg, prev);
    const guarded = applyBundleGuard(normalized);
    const compatibilityIssues = validateModuleSelection(guarded.modules as StandModules);
    set({
      config: guarded,
      pricePending: true,
      validationPending: true,
      validationIssues: [],
      runtimeError: null,
      compatibilityIssues,
      priceBreakdown: null,
    });
    runtimeSync(guarded);
  };

  applyFinalRef.current = applyFinal;

  // initial Backend-Sync anstoÃŸen
  setTimeout(() => runtimeSync(initial.config), 0);
  void syncModuleCatalog();

  return {
    config: initial.config,
    price: initial.price,
    priceBreakdown: initial.priceBreakdown,
    pricePending: true,
    validationPending: true,
    validationIssues: [],
    runtimeError: null,
    lastRuntimeSync: undefined,
    moduleCatalog: staticModuleCatalog,
    moduleVariants: staticModuleVariants,
    moduleCompatibility: staticModuleCompatibility,
    compatibilityIssues: [],

    history: [],
    future: [],
    historyLimit: DEFAULT_HISTORY_LIMIT,

    // ---- Haupt-API ----
    setConfig: (partial, options) => {
      if (!options?.skipHistory) {
        pushHistory();
      }
      const current = get().config;
      const merged: StandConfig = {
        ...current,
        ...partial,
        modules: mergeModules(current.modules, partial.modules),
      };
      applyFinal(merged, current);
    },
    checkpoint: () => {
      pushHistory();
    },

    applyPreset: (preset) => {
      pushHistory();
      const prev = get().config;
      const { config } = withNormalized(presetConfigs[preset]);
      applyFinal(config, prev);
    },

    replaceConfig: (next) => {
      pushHistory();
      applyFinal(next, get().config);
    },

    reset: () => {
      pushHistory();
      const { config } = withNormalized(presetConfigs.small);
      applyFinal(config, get().config);
    },

    refreshRuntime: () => {
      runtimeSync();
    },
    refreshModuleCatalog: () => syncModuleCatalog(),

    saveRemoteConfig: async () => {
      try {
        ensureCompatibilityAllowed();
        const snapshot = get().config;
        const saved = await saveRuntimeConfig(snapshot);
        rememberShareLocally(snapshot, saved.id);
        return saved;
      } catch (err) {
        set({
          runtimeError: err instanceof Error ? err.message : "Speichern fehlgeschlagen",
        });
        return null;
      }
    },

    saveShareableConfig: async () => {
      ensureCompatibilityAllowed();
      const snapshot = get().config;
      const remote = await get().saveRemoteConfig();
      if (remote?.id) {
        return { id: remote.id, source: "remote" as const, expiresAt: remote.expiresAt };
      }
      const fallback = rememberShareLocally(snapshot);
      return { id: fallback.id, source: "local" as const };
    },

    loadRemoteConfig: async (id: string) => {
      try {
        const loaded = await loadRuntimeConfig(id);
        const normalized = normalizeConfig(loaded, get().config);
        rememberShareLocally(normalized, id);
        pushHistory();
        applyFinal(normalized, get().config);
        return true;
      } catch (err) {
        const local = loadLocalShare(id);
        if (local) {
          const normalizedLocal = normalizeConfig(local, get().config);
          pushHistory();
          applyFinal(normalizedLocal, get().config);
          set({ runtimeError: null });
          return true;
        }
        set({
          runtimeError:
            err instanceof Error ? err.message : "Konfiguration konnte nicht geladen werden.",
        });
        return false;
      }
    },

    // ---- Modul-Helfer ----
    patchModules: (partial) => {
      get().setConfig({ modules: partial });
    },

    setModule: (key, value) => {
      const partial = { [key]: value } as unknown as DeepPartial<StandModules>;
      get().setConfig({ modules: partial });
    },

    setCabinPosition: (x, z) => {
      const current = get().config;
      const cabin = (current.modules.cabin ?? ({} as CabinWithPosition)) as CabinWithPosition;
      const pos = clampCabinPosition(current, { ...cabin, position: { x, z } });

      get().setConfig({
        modules: {
          cabin: {
            position: pos,
          } as any,          // Type assertion needed for partial update
        },
      });
    },

    nudgeCabin: (dx, dz) => {
      const current = get().config;
      const cabin = (current.modules.cabin ?? ({} as CabinWithPosition)) as CabinWithPosition;
      const cx = (cabin.position?.x ?? -current.width / 2 + (cabin.width ?? 1.5) / 2 + 0.25) + dx;
      const cz = (cabin.position?.z ?? -current.depth / 2 + (cabin.depth ?? 1.5) / 2 + 0.25) + dz;
      get().setCabinPosition(cx, cz);
    },

    setCabinSize: (width, depth) => {
      const current = get().config;
      const cabin = (current.modules.cabin ?? ({} as CabinWithPosition)) as CabinWithPosition;
      const clamped = clampCabinSize(current, { ...cabin, width, depth });
      get().setConfig({
        modules: {
          cabin: {
            width: clamped.width,
            depth: clamped.depth,
          } as any, // Type assertion needed for partial update
        },
      });
    },



    // ---- WÃ¤nde / OberflÃ¤chen ----
    setWallSurface: (side, surface) => {
      const current = get().config;
      const prev = current.modules.wallsDetail ?? {};
      get().setConfig({
        modules: {
          wallsDetail: {
            ...prev,
            [side]: { ...(prev[side] ?? {}), surface },
          },
        },
      });
    },

    // ---- Undo/Redo ----
    undo: () => {
      const { history, future } = get();
      if (history.length === 0) return false;
      const prev = history[history.length - 1];
      const newHist = history.slice(0, history.length - 1);
      const now = get().config;
      set({ history: newHist, future: [now, ...future] });
      applyFinal(prev, now);
      return true;
    },

    redo: () => {
      const { history, future } = get();
      if (future.length === 0) return false;
      const next = future[0];
      const rest = future.slice(1);
      const now = get().config;
      set({ history: [...history, now], future: rest });
      applyFinal(next, now);
      return true;
    },
  };
    },
    {
      name: CONFIG_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ config: state.config }),
      onRehydrateStorage: () => (state) => {
        if (state?.config && applyFinalRef.current) {
          applyFinalRef.current(state.config);
        }
      },
    }
  )
);
