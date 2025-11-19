// src/lib/pricing.ts

// ======================
// Typen
// ======================

export type StandType = "row" | "corner" | "head" | "island";
export type Region = "NRW" | "Süd" | "Nord" | "Ausland";

export type WallSide = "back" | "left" | "right";
export type WallType = "plain" | "wood" | "led" | "banner" | "seg";

export type WallConfig = {
  closed: boolean;
  type: WallType;
  height: number; // Meter
};

export type WallSurface = "system" | "wood" | "banner" | "seg" | "led";

export type WallDetailConfig = {
  surface?: WallSurface;
  height?: number; // optional, falls Wand abweichend von Standhöhe
};

export type FloorType = "carpet" | "laminate" | "vinyl" | "wood";

export type FloorConfig = {
  type: FloorType;
  raised: boolean;
  colorVariant?: string;
};

// Kabine / Lagerraum
export type CabinDoorSide = "front" | "left" | "right" | "back";

export type CabinDoorConfig = {
  side: CabinDoorSide;
  width: number; // Meter
};

export type CabinConfig = {
  enabled: boolean;
  width: number;
  depth: number;
  height: number;

  /** Legacy: eine einfache Türangabe (falls doors nicht genutzt wird) */
  doorSide?: CabinDoorSide;

  /** Position der Kabinenmitte relativ zur Standmitte (0/0) */
  position?: {
    x: number;
    z: number;
  };

  /** Optionale Liste an Türen (einzeln oder mehrere / breite Öffnung) */
  doors?: CabinDoorConfig[];
};

export type ScreenSize = "55" | "65" | "75";

export type ScreenConfig = {
  size: ScreenSize;
  mount: "wall" | "truss" | "floor";
  wallSide?: WallSide;
  position?: {
    x: number;
    y?: number;
    z?: number;
  };
};

export type SeatingType = "chair" | "barstool" | "lounge";
export type SeatingCover = "none" | "white" | "branding";

export type SeatingConfig = {
  type: SeatingType;
  count: number;
  cover: SeatingCover;
};

// Truss-Anbauteile
export type TrussAttachmentType = "light" | "bannerFrame";

export type TrussAttachmentConfig = {
  type: TrussAttachmentType;
  count: number;
};

export type TrussConfig = {
  enabled: boolean;
  lengthX: number; // Meter
  lengthZ: number; // Meter
  height: number; // Meter
  attachments: TrussAttachmentConfig[];
};

// Tresen / Counter (detailliert)
export type CounterVariant = "basic" | "premium" | "corner";

export type CounterConfig = {
  variant: CounterVariant;
  /** lokales Strom-Flag, überschreibt ggf. globales countersWithPower */
  withPower?: boolean;
  /** Position relativ zur Standmitte (0/0) */
  position: {
    x: number;
    z: number;
  };
  /** optionale Ausrichtung in Rad (Three.js: rotation-y) */
  rotationY?: number;
  /** optionale Maße, falls später gebraucht */
  width?: number;
  depth?: number;
};

export type StandModules = {
  // Legacy-Felder
  wallsClosedSides: number;
  storageRoom: boolean;
  storageDoorSide?: "left" | "right" | "front";

  ledFrames: number;
  ledWall?: WallSide;

  counters: number;
  countersWall?: "front" | "island";
  countersWithPower?: boolean;
  counterVariant?: CounterVariant;

  screens: number;
  screensWall?: WallSide;

  truss?: boolean;
  raisedFloor?: boolean;

  // Lampen & Licht
  /** Gesamtsumme (alt, Fallback) */
  trussLights?: number;

  /** neue, aufgeteilte Felder aus UI / 3D */
  trussLightsFront?: number;
  trussLightsBack?: number;
  trussLightsLeft?: number;
  trussLightsRight?: number;
  trussLightType?: "spot" | "wash";

  wallLightsBack?: number;
  wallLightsLeft?: number;
  wallLightsRight?: number;

  // Wände (für Advanced-Pricing)
  walls?: Partial<Record<WallSide, WallConfig>>;
  /** Detail-Oberflächen / Sonderhöhen für 3D & Pricing */
  wallsDetail?: Partial<Record<WallSide, WallDetailConfig>>;

  // Kabine
  cabin?: CabinConfig;

  // Boden
  floor?: FloorConfig;

  // Screens & Seating
  detailedScreens?: ScreenConfig[];
  seating?: SeatingConfig[];

  // Truss-Details (optional, falls später genutzt)
  trussConfig?: TrussConfig;

  // weitere Truss-Infos aus UI
  trussBannersFront?: number;
  trussBannersBack?: number;
  trussBannersLeft?: number;
  trussBannersRight?: number;
  trussBannerWidth?: number;
  trussBannerHeight?: number;

  /** absolute Truss-Höhe über Hallenboden (m), optional */
  trussHeight?: number;

  /** neue, frei positionierbare Tresen */
  countersDetailed?: CounterConfig[];
};

export type StandConfig = {
  width: number; // Meter
  depth: number; // Meter
  height: number; // Meter (Standard-Wandhöhe)
  type: StandType;
  region: Region;
  rush: boolean;
  modules: StandModules;
};

// ======================
// Basis-Konditionen S&S
// ======================

// Eigenleistung / eigene Projekte
const HOURLY_RATE_OWN = 60; // € pro Stunde
const DAY_RATE_10H = 550; // € pro 10 Stunden (Tagespauschale, hohe Kante)

// Grundmaterial/Systemstand (Struktur, Grafiken, Kleinteile)
const BASE_MATERIAL_PER_M2 = 110; // € pro m² Grundfläche

// Arbeitszeit-Aufwand (Auf- + Abbau zusammen)
const LABOR_HOURS_PER_M2 = 1.2;

// Reisekosten-Pauschalen (Fahrt + Zeit + Spesen grob, eher hoch)
const TRAVEL_COST_MAP: Record<Region, number> = {
  NRW: 250,
  Nord: 600,
  Süd: 800,
  Ausland: 1500,
};

// Regionale Preisfaktoren (Hotel, Spesen, Organisation)
const REGION_FACTOR_MAP: Record<Region, number> = {
  NRW: 1.0,
  Nord: 1.04,
  Süd: 1.06,
  Ausland: 1.18,
};

// ======================
// Modulpreise Legacy (grobe Module)
// ======================

// Basis-Wandpreis pro m² Systemwand
const WALL_BASE_PRICE_PER_M2 = 18;

const STORAGE_ROOM_FLAT = 600; // Kabine pauschal (wenn nicht als CabinConfig modelliert)

const LED_FRAME_PRICE = 1284; // pro LED-Rahmen

// Tresen (Legacy)
const COUNTER_PRICE_BASIC = 220;
const COUNTER_PRICE_PREMIUM = 340;
const COUNTER_PRICE_CORNER = 280;
const COUNTER_POWER_SURCHARGE = 65;

const SCREEN_PRICE_LEGACY = 250; // pro Standard-Screen

const RAISED_FLOOR_SURCHARGE_PER_M2 = 45;

// ======================
// Modulpreise Advanced
// ======================

// Wände (Feintypen-Zuschläge)
const WOOD_WALL_SURCHARGE_PER_M2 = 75;
const LED_WALL_SURCHARGE_PER_M2 = 220;
const BANNER_WALL_SURCHARGE_PER_M2 = 60;

// Bodenbeläge (Zuschlag gegenüber normalem Messe-Teppich)
const FLOOR_LAMINATE_SURCHARGE_PER_M2 = 18;
const FLOOR_VINYL_SURCHARGE_PER_M2 = 14;
const FLOOR_WOOD_SURCHARGE_PER_M2 = 28;

// Kabine (variable Größe)
const CABIN_PRICE_PER_M2 = 360;
const CABIN_DOOR_PRICE = 220;

// Screens nach Größe
const SCREEN_PRICE_BY_SIZE: Record<ScreenSize, number> = {
  "55": 250,
  "65": 380,
  "75": 520,
};

// Seating
const SEATING_BASE_PRICE: Record<SeatingType, number> = {
  chair: 18,
  barstool: 36,
  lounge: 75,
};

const SEATING_COVER_SURCHARGE: Record<SeatingCover, number> = {
  none: 0,
  white: 6,
  branding: 18,
};

// Truss-Details
const TRUSS_METER_PRICE = 65;
const TRUSS_LIGHT_PRICE = 120;
const TRUSS_BANNER_FRAME_PRICE = 260;

// Wandstrahler
const WALL_LIGHT_PRICE = 60;

// ======================
// Hilfsfunktionen
// ======================

function calcLaborCost(area: number): number {
  const hours = area * LABOR_HOURS_PER_M2;

  if (hours >= 9) {
    const days = Math.ceil(hours / 10);
    return days * DAY_RATE_10H;
  } else {
    return hours * HOURLY_RATE_OWN;
  }
}

// Länge einer Wandseite (zur Flächenberechnung)
function getWallSideLength(cfg: StandConfig, side: WallSide): number {
  if (side === "back") return cfg.width;
  return cfg.depth;
}

function mapSurfaceToWallType(surface?: string | null): WallType {
  switch (surface) {
    case "wood":
      return "wood";
    case "banner":
      return "banner";
    case "seg":
      return "seg";
    case "led":
      return "led";
    default:
      return "plain";
  }
}

// ======================
// Legacy-Modulkosten
// ======================

function calcLegacyModuleCost(cfg: StandConfig, area: number): number {
  const m = cfg.modules;
  let sum = 0;

  // Lagerraum nur berechnen, wenn nicht schon eine variable Kabine genutzt wird
  const useLegacyCabin = !m.cabin?.enabled;
  if (useLegacyCabin && m.storageRoom) {
    sum += STORAGE_ROOM_FLAT;
  }

  // LED-Rahmen
  sum += (m.ledFrames ?? 0) * LED_FRAME_PRICE;

  // Tresen: nur Legacy, wenn keine detaillierten Tresen verwendet werden
  const useLegacyCounters = !m.countersDetailed || m.countersDetailed.length === 0;
  if (useLegacyCounters) {
    const count = m.counters ?? 0;
    sum += count * COUNTER_PRICE_BASIC;

    if (m.countersWithPower) {
      sum += count * COUNTER_POWER_SURCHARGE;
    }
  }

  // Screens (nur, wenn keine detaillierten Screens genutzt werden)
  const useLegacyScreens = !m.detailedScreens || m.detailedScreens.length === 0;
  if (useLegacyScreens) {
    sum += (m.screens ?? 0) * SCREEN_PRICE_LEGACY;
  }

  // Doppelboden (grob) – nur, wenn Floor nicht schon raised=true hat
  const useLegacyRaised = !m.floor?.raised;
  if (useLegacyRaised && m.raisedFloor) {
    sum += RAISED_FLOOR_SURCHARGE_PER_M2 * area;
  }

  return sum;
}

// ======================
// Advanced-Modulkosten
// ======================

function calcAdvancedWallsCost(cfg: StandConfig): number {
  const m = cfg.modules;
  const wallsClosed = m.wallsClosedSides ?? 0;
  if (wallsClosed <= 0) return 0;

  const baseHeight = cfg.height || 2.5;
  const details = m.wallsDetail ?? {};
  const wallsConfig = m.walls ?? {};

  let sum = 0;

  (["back", "left", "right"] as WallSide[]).forEach((side) => {
    const isClosed =
      (side === "back" && wallsClosed >= 1) ||
      (side === "left" && wallsClosed >= 2) ||
      (side === "right" && wallsClosed >= 3);

    if (!isClosed) return;

    const length = getWallSideLength(cfg, side);

    const wallHeight =
      details[side]?.height ?? wallsConfig[side]?.height ?? baseHeight;

    const area = length * wallHeight;

    // Basis-Systemwand
    sum += area * WALL_BASE_PRICE_PER_M2;

    // Oberfläche
    const surface = details[side]?.surface;
    const wallType = mapSurfaceToWallType(surface);

    switch (wallType) {
      case "wood":
        sum += area * WOOD_WALL_SURCHARGE_PER_M2;
        break;
      case "led":
        sum += area * LED_WALL_SURCHARGE_PER_M2;
        break;
      case "banner":
        sum += area * BANNER_WALL_SURCHARGE_PER_M2;
        break;
      case "seg":
      case "plain":
      default:
        // im Basispreis enthalten
        break;
    }
  });

  return sum;
}

function calcFloorCost(cfg: StandConfig): number {
  const m = cfg.modules;
  const floor = m.floor;
  if (!floor) return 0;

  const area = cfg.width * cfg.depth;
  let sum = 0;

  switch (floor.type) {
    case "laminate":
      sum += area * FLOOR_LAMINATE_SURCHARGE_PER_M2;
      break;
    case "vinyl":
      sum += area * FLOOR_VINYL_SURCHARGE_PER_M2;
      break;
    case "wood":
      sum += area * FLOOR_WOOD_SURCHARGE_PER_M2;
      break;
    case "carpet":
    default:
      // Messe-Teppich betrachten wir als im Grundpreis enthalten
      break;
  }

  if (floor.raised) {
    sum += area * RAISED_FLOOR_SURCHARGE_PER_M2;
  }

  return sum;
}

function calcCabinCost(cfg: StandConfig): number {
  const cabin = cfg.modules.cabin;
  if (!cabin || !cabin.enabled) return 0;

  const area = cabin.width * cabin.depth;
  let sum = area * CABIN_PRICE_PER_M2;

  // Türen:
  // - wenn doors gesetzt: Anzahl * CABIN_DOOR_PRICE
  // - sonst: 1 Tür, wenn doorSide gesetzt ist
  const explicitDoors = cabin.doors?.length ?? 0;
  const hasLegacyDoor = cabin.doorSide != null;
  const doorCount =
    explicitDoors > 0 ? explicitDoors : hasLegacyDoor ? 1 : 0;

  if (doorCount > 0) {
    sum += doorCount * CABIN_DOOR_PRICE;
  }

  // höhere Kabinen → kleiner Aufschlag
  if (cabin.height > 2.5) {
    const extraHeight = cabin.height - 2.5;
    sum *= 1 + extraHeight * 0.08; // +8% pro 0,5m
  }

  return sum;
}

function calcDetailedScreensCost(screens: ScreenConfig[]): number {
  let sum = 0;
  for (const s of screens) {
    sum += SCREEN_PRICE_BY_SIZE[s.size];
  }
  return sum;
}

function calcSeatingCost(seating: SeatingConfig[] | undefined): number {
  if (!seating || seating.length === 0) return 0;

  let sum = 0;
  for (const s of seating) {
    const base = SEATING_BASE_PRICE[s.type];
    const cover = SEATING_COVER_SURCHARGE[s.cover];
    sum += s.count * (base + cover);
  }
  return sum;
}

function calcWallLightsCost(cfg: StandConfig): number {
  const m = cfg.modules;
  const back = m.wallLightsBack ?? 0;
  const left = m.wallLightsLeft ?? 0;
  const right = m.wallLightsRight ?? 0;

  const total = back + left + right;
  return total * WALL_LIGHT_PRICE;
}

/**
 * Detaillierte Tresen-Kalkulation:
 * - Variante (basic/premium/corner)
 * - Strom optional pro Tresen
 */
function calcDetailedCountersCost(
  counters: CounterConfig[],
  defaultVariant: CounterVariant | undefined,
  defaultWithPower: boolean | undefined
): number {
  let sum = 0;

  for (const c of counters) {
    const variant = c.variant ?? defaultVariant ?? "basic";

    let base = COUNTER_PRICE_BASIC;
    if (variant === "premium") base = COUNTER_PRICE_PREMIUM;
    else if (variant === "corner") base = COUNTER_PRICE_CORNER;

    sum += base;

    const withPower = c.withPower ?? defaultWithPower ?? false;
    if (withPower) {
      sum += COUNTER_POWER_SURCHARGE;
    }
  }

  return sum;
}

/**
 * Truss-Kosten:
 * - Grundrahmen rund um den Stand (oder TrussConfig)
 * - Truss-Lampen (Front/Back/Left/Right + Legacy-Feld)
 * - Bannerrahmen
 */
function calcTrussCost(cfg: StandConfig): number {
  const m = cfg.modules as any;

  const hasTrussFlag = !!m.truss || !!m.trussConfig?.enabled;
  if (!hasTrussFlag) return 0;

  let sum = 0;

  // 1) Truss-Rahmen (Umfang)
  let perimeter: number;
  if (m.trussConfig?.lengthX && m.trussConfig?.lengthZ) {
    perimeter = 2 * (m.trussConfig.lengthX + m.trussConfig.lengthZ);
  } else {
    perimeter = 2 * (cfg.width + cfg.depth);
  }
  sum += perimeter * TRUSS_METER_PRICE;

  // 2) Truss-Lampen
  let lights = 0;

  if (m.trussConfig?.attachments) {
    for (const att of m.trussConfig.attachments as TrussAttachmentConfig[]) {
      if (att.type === "light") lights += att.count;
    }
  }

  const splitLights =
    (m.trussLightsFront ?? 0) +
    (m.trussLightsBack ?? 0) +
    (m.trussLightsLeft ?? 0) +
    (m.trussLightsRight ?? 0);

  const legacyLights = m.trussLights ?? 0;

  lights += splitLights + legacyLights;
  sum += lights * TRUSS_LIGHT_PRICE;

  // 3) Bannerrahmen
  let frames = 0;

  if (m.trussConfig?.attachments) {
    for (const att of m.trussConfig.attachments as TrussAttachmentConfig[]) {
      if (att.type === "bannerFrame") frames += att.count;
    }
  }

  const splitFrames =
    (m.trussBannersFront ?? 0) +
    (m.trussBannersBack ?? 0) +
    (m.trussBannersLeft ?? 0) +
    (m.trussBannersRight ?? 0);

  frames += splitFrames;

  sum += frames * TRUSS_BANNER_FRAME_PRICE;

  // Optional: sehr hohe Truss leicht aufpreisen (z.B. > 4 m)
  if (cfg.modules.trussHeight && cfg.modules.trussHeight > 4) {
    const extraH = cfg.modules.trussHeight - 4;
    sum *= 1 + extraH * 0.05; // +5 % pro Meter über 4 m
  }

  return sum;
}

function calcAdvancedModuleCost(cfg: StandConfig): number {
  let sum = 0;

  sum += calcAdvancedWallsCost(cfg);
  sum += calcFloorCost(cfg);
  sum += calcCabinCost(cfg);

  if (cfg.modules.detailedScreens && cfg.modules.detailedScreens.length > 0) {
    sum += calcDetailedScreensCost(cfg.modules.detailedScreens);
  }

  if (cfg.modules.countersDetailed && cfg.modules.countersDetailed.length > 0) {
    sum += calcDetailedCountersCost(
      cfg.modules.countersDetailed,
      cfg.modules.counterVariant,
      cfg.modules.countersWithPower
    );
  }

  sum += calcSeatingCost(cfg.modules.seating);
  sum += calcTrussCost(cfg);
  sum += calcWallLightsCost(cfg);

  return sum;
}

// ======================
// Hauptfunktion
// ======================

export function calcPrice(cfg: StandConfig): number {
  const area = cfg.width * cfg.depth;

  // 1) Material/Systemstand (Struktur, Grafiken, Boden, Kleinteile)
  const materialCost = area * BASE_MATERIAL_PER_M2;

  // 2) Arbeitszeit (Auf- und Abbau, interne Mannschaft)
  const laborCost = calcLaborCost(area);

  // 3) Module (Legacy + Advanced)
  const legacyModules = calcLegacyModuleCost(cfg, area);
  const advancedModules = calcAdvancedModuleCost(cfg);
  const moduleCost = legacyModules + advancedModules;

  // 4) Reisekosten (Pauschale nach Region)
  const travelCost = TRAVEL_COST_MAP[cfg.region];

  // Zwischensumme
  let sum = materialCost + laborCost + moduleCost + travelCost;

  // 5) Regionaler Faktor (Norden/Süden/Ausland etwas teurer)
  sum *= REGION_FACTOR_MAP[cfg.region];

  // 6) Eilzuschlag (Kurzfristig)
  if (cfg.rush) {
    sum *= 1.15; // 15 % Eilzuschlag
  }

  // 7) Sicherheitszuschlag / Marge
  sum *= 1.08;

  return Math.round(sum);
}
