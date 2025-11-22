// src/store/configStore.ts
import { create } from "zustand";
import { calcPrice } from "../lib/pricing";
import type {
  StandConfig,
  StandType,
  WallSide,
  WallConfig,
  CabinConfig,
  StandModules,
} from "../lib/pricing";

type PresetName = "small" | "medium" | "premium";

/** Rekursives Partial für verschachtelte Patches (auch Arrays) */
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

/** Optionale Kabinen-Position im Store */
type CabinWithPosition = CabinConfig & {
  position?: { x?: number; z?: number };
};

/** Wandoberflächen (UI/3D-spezifisch) */
export type WallSurface = "system" | "wood" | "banner" | "seg" | "led";

/** Store-State + Actions */
type ConfigState = {
  config: StandConfig;
  price: number;

  /** Undo/Redo-Stacks (intern, nützlich z. B. für Buttons) */
  history: StandConfig[];
  future: StandConfig[];
  historyLimit: number;

  /** Generische Haupt-API */
  setConfig: (partial: ConfigPatch) => void;
  applyPreset: (preset: PresetName) => void;
  replaceConfig: (next: StandConfig) => void;
  reset: () => void;

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

// ───────────────────────────────────────────────────────────────────────────────
// feste Anzahl geschlossener Seiten pro Standtyp
const wallFixedMap: Record<StandType, number> = {
  row: 3,
  corner: 2,
  head: 1,
  island: 0,
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

// Kabinen-Position immer innerhalb der Standfläche halten
function clampCabinPosition(
  cfg: StandConfig,
  cabin: CabinWithPosition
): { x: number; z: number } {
  const standHalfX = cfg.width / 2;
  const standHalfZ = cfg.depth / 2;

  const cabinWidth = cabin.width || 1.5;
  const cabinDepth = cabin.depth || 1.5;

  const cabinHalfX = cabinWidth / 2;
  const cabinHalfZ = cabinDepth / 2;

  const minX = -standHalfX + cabinHalfX;
  const maxX = standHalfX - cabinHalfX;
  const minZ = -standHalfZ + cabinHalfZ;
  const maxZ = standHalfZ - cabinHalfZ;

  // Default: hinten links, mit 0.25 m Abstand zu den Wänden
  const defaultX = -standHalfX + cabinHalfX + 0.25;
  const defaultZ = -standHalfZ + cabinHalfZ + 0.25;

  const rawX = cabin.position?.x ?? defaultX;
  const rawZ = cabin.position?.z ?? defaultZ;

  const x = Math.min(maxX, Math.max(minX, rawX));
  const z = Math.min(maxZ, Math.max(minZ, rawZ));

  return { x, z };
}

/** Sichere Deep-Merge-Funktion für Module (nimmt DeepPartial entgegen) */
function mergeModules(
  base: StandModules,
  patch?: DeepPartial<StandModules>
): StandModules {
  if (!patch) return base;

  // Start: Kopie des aktuellen Zustands (verhindert TS2739 bei Objekt-Literal + Spread)
  const out: StandModules = { ...base };

  // generisch alle Keys (auch unbekannte wie trussBannerImageUrl) übernehmen
  Object.assign(out as any, patch as any);

  // 1) Flach patchen: bekannte einfachen Felder, außer verschachtelte Objekte
  const shallowKeys: (keyof StandModules | "trussBannerImageUrl")[] = [
    "wallsClosedSides",
    "storageRoom",
    "storageDoorSide",
    "ledFrames",
    "ledWall",
    "counters",
    "countersWall",
    "countersWithPower",
    "counterVariant",
    "screens",
    "screensWall",
    "truss",
    "trussLights",
    "trussLightType",
    "trussHeight",
    "trussLightsFront",
    "trussLightsBack",
    "trussLightsLeft",
    "trussLightsRight",
    "wallLightsBack",
    "wallLightsLeft",
    "wallLightsRight",
    "trussBannersFront",
    "trussBannersBack",
    "trussBannersLeft",
    "trussBannersRight",
    "trussBannerWidth",
    "trussBannerHeight",
    // extra Feld, das typseitig evtl. nicht in StandModules steht:
    "trussBannerImageUrl",
    "raisedFloor",
  ];

  for (const k of shallowKeys) {
    if (patch && k in (patch as any)) {
      (out as any)[k] = (patch as any)[k];
    }
  }

  // 2) floor deep-merge
  if (patch.floor) {
    out.floor = { ...base.floor, ...(patch.floor as any) };
  }

  // 3) cabin deep-merge (inkl. optionaler Position)
  if (patch.cabin) {
    const baseCabin =
      base.cabin as (CabinConfig & { position?: { x?: number; z?: number } }) | undefined;
    const patchCabin =
      patch.cabin as DeepPartial<CabinConfig> & { position?: { x?: number; z?: number } };

    out.cabin = {
      ...(baseCabin ?? {}),
      ...(patchCabin ?? {}),
      position: {
        ...(baseCabin?.position ?? {}),
        ...(patchCabin?.position ?? {}),
      },
    } as any; // 'position' ist Zusatzfeld -> als any zurück in CabinConfig
  }

  // 4) walls + wallsDetail deep-merge
  if (patch.walls) {
    out.walls = { ...(base.walls ?? {}), ...(patch.walls as any) } as any;
  }
  if (patch.wallsDetail) {
    out.wallsDetail = {
      ...(base.wallsDetail ?? {}),
      ...(patch.wallsDetail as any),
    } as any;
  }

  // 5) Arrays nur ersetzen, wenn explizit geliefert
  if (patch.detailedScreens !== undefined) {
    out.detailedScreens = patch.detailedScreens as any;
  }
  if (patch.countersDetailed !== undefined) {
    out.countersDetailed = patch.countersDetailed as any;
  }

  return out;
}

function normalizeConfig(cfg: StandConfig): StandConfig {
  const baseHeight = cfg.height || 2.5;

  // feste Anzahl geschlossener Wände je Standtyp
  const fixedWalls = wallFixedMap[cfg.type];

  let modules: StandModules = {
    ...cfg.modules,
    wallsClosedSides: fixedWalls,
  };

  // existierende Wände
  const hasBack = fixedWalls >= 1;
  const hasLeft = fixedWalls >= 2;
  const hasRight = fixedWalls >= 3;

  // Lagerraum nur sinnvoll, wenn Rückwand existiert
  if (!hasBack) {
    modules.storageRoom = false;
    if (modules.cabin) {
      (modules.cabin as CabinWithPosition).enabled = false;
    }
  }

  // erlaubte Wandseiten (für LED / Screens)
  const allowedWalls: WallSide[] = [];
  if (hasBack) allowedWalls.push("back");
  if (hasLeft) allowedWalls.push("left");
  if (hasRight) allowedWalls.push("right");

  const fixWall = (wall?: WallSide): WallSide | undefined => {
    if (!allowedWalls.length) return undefined;
    if (wall && allowedWalls.includes(wall)) return wall;
    return allowedWalls[0];
  };

  // LED / Screens nur auf existierenden Wänden platzieren
  modules.ledWall = fixWall(modules.ledWall);
  modules.screensWall = fixWall(modules.screensWall);

  // Wenn keine geeignete Wand existiert, wall-gebundene Module entfernen
  if (!allowedWalls.length) {
    modules.screens = 0;
    modules.ledFrames = 0;
    if (modules.detailedScreens) {
      modules.detailedScreens = modules.detailedScreens.filter(
        (scr) => (scr.mount ?? "wall") !== "wall"
      );
    }
  }

  // Fallback: falls keine gültige Wandseite, Zähler zurücksetzen
  if (!modules.screensWall && (modules.screens ?? 0) > 0) {
    modules.screens = 0;
  }
  if (!modules.ledWall && (modules.ledFrames ?? 0) > 0) {
    modules.ledFrames = 0;
  }

  // Detaillierte Screens an vorhandene Wände anpassen
  if (allowedWalls.length && modules.detailedScreens?.length) {
    modules.detailedScreens = modules.detailedScreens.map((scr) => {
      if ((scr.mount ?? "wall") !== "wall") return scr;
      const side = scr.wallSide;
      if (side && allowedWalls.includes(side)) return scr;
      return { ...scr, wallSide: allowedWalls[0] };
    });
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
  const storageActive = !!modules.storageRoom;

  if (!modules.cabin) {
    modules.cabin = {
      enabled: storageActive,
      width: 1.5,
      depth: 1.5,
      height: baseHeight,
      doorSide: modules.storageDoorSide ?? "front",
    } as CabinWithPosition;
  } else {
    // Kabinenhöhe an Standhöhe koppeln
    modules.cabin.height = baseHeight;

    if (!modules.cabin.doorSide) {
      modules.cabin.doorSide = modules.storageDoorSide ?? "front";
    }

    // Lagerraum-Flag steuert, ob Kabine aktiv ist
    (modules.cabin as CabinWithPosition).enabled = storageActive;
  }

  // Kabine positionieren (bewegbar, aber immer innerhalb der Standfläche)
  const cabin = modules.cabin as CabinWithPosition | undefined;
  if (cabin && cabin.enabled) {
    const pos = clampCabinPosition(cfg, cabin);
    modules.cabin = {
      ...cabin,
      position: pos,
    } as CabinWithPosition;
  }

  // --- Wände-Objekt (für Advanced-Pricing) aufbauen ---
  modules.walls = buildWalls(cfg, modules, hasBack, hasLeft, hasRight);

  // --- Lampen-Defaults ---
  if ((modules as any).trussLights == null) (modules as any).trussLights = 0;
  if ((modules as any).wallLightsBack == null) (modules as any).wallLightsBack = 0;
  if ((modules as any).wallLightsLeft == null) (modules as any).wallLightsLeft = 0;
  if ((modules as any).wallLightsRight == null) (modules as any).wallLightsRight = 0;

  return { ...cfg, modules };
}

// Presets (werden mit normalizeConfig aufbereitet)
const presetConfigs: Record<PresetName, StandConfig> = {
  small: {
    width: 3,
    depth: 3,
    height: 2.5,
    type: "row",
    region: "NRW",
    rush: false,
    modules: {
      // wird durch normalizeConfig auf 3 gesetzt
      wallsClosedSides: 2,
      storageRoom: false,
      storageDoorSide: "front",

      ledFrames: 0,
      ledWall: "back",

      counters: 1,
      countersWall: "front",
      countersWithPower: false,
      counterVariant: "basic",

      screens: 1,
      screensWall: "back",

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
      storageDoorSide: "front",

      ledFrames: 2,
      ledWall: "back",

      counters: 2,
      countersWall: "front",
      countersWithPower: true,

      screens: 2,
      screensWall: "back",

      truss: false,
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
      wallsClosedSides: 2, // wird durch normalizeConfig auf 1 gesetzt
      storageRoom: true,
      storageDoorSide: "left",

      ledFrames: 3,
      ledWall: "back",

      counters: 3,
      countersWall: "island",
      countersWithPower: true,

      screens: 4,
      screensWall: "back",

      truss: true,
      raisedFloor: true,
    },
  },
};

function withNormalized(cfg: StandConfig) {
  const normalized = normalizeConfig(cfg);
  return { config: normalized, price: calcPrice(normalized) };
}

const initial = withNormalized(presetConfigs.small);

// ───────────────────────────────────────────────────────────────────────────────
// Store
export const useConfigStore = create<ConfigState>((set, get) => {
  /** Helper: in History pushen (mit Limit) */
  const pushHistory = () => {
    const { history, historyLimit, config } = get();
    const next = [...history, config];
    const cut =
      next.length > historyLimit ? next.slice(next.length - historyLimit) : next;
    // bei jedem neuen Schritt Future verwerfen
    set({ history: cut, future: [] });
  };

  /** Helper: Recalculate (Normalize + Price) und setzen */
  const applyFinal = (cfg: StandConfig) => {
    const normalized = normalizeConfig(cfg);
    const price = calcPrice(normalized);
    set({ config: normalized, price });
  };

  return {
    config: initial.config,
    price: initial.price,

    history: [],
    future: [],
    historyLimit: 20,

    // ---- Haupt-API ----
    setConfig: (partial) => {
      pushHistory();
      const current = get().config;
      const merged: StandConfig = {
        ...current,
        ...partial,
        modules: mergeModules(current.modules, partial.modules),
      };
      applyFinal(merged);
    },

    applyPreset: (preset) => {
      pushHistory();
      const { config, price } = withNormalized(presetConfigs[preset]);
      set({ config, price });
    },

    replaceConfig: (next) => {
      pushHistory();
      applyFinal(next);
    },

    reset: () => {
      pushHistory();
      const { config, price } = withNormalized(presetConfigs.small);
      set({ config, price });
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
          } as any,          // ✅ nur Teil-Update, nicht komplette CabinConfig
        } as any,
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
      get().setConfig({
        modules: {
          cabin: {
            width,
            depth,
         } as any,           // ✅ Teil-Update
       } as any,
     });
   },


    // ---- Wände / Oberflächen ----
    setWallSurface: (side, surface) => {
      const current = get().config;
      const prev = (current.modules as any).wallsDetail ?? {};
      get().setConfig({
        modules: {
          wallsDetail: {
            ...prev,
            [side]: { ...(prev[side] ?? {}), surface },
          },
        } as any,
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
      applyFinal(prev);
      return true;
    },

    redo: () => {
      const { history, future } = get();
      if (future.length === 0) return false;
      const next = future[0];
      const rest = future.slice(1);
      const now = get().config;
      set({ history: [...history, now], future: rest });
      applyFinal(next);
      return true;
    },
  };
});
