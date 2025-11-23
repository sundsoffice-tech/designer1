// src/lib/pricing.ts

// ======================
// Typen
// ======================

export type StandType = "row" | "corner" | "head" | "island";
export type Region = "NRW" | "Sued" | "S\u00fcd" | "Nord" | "Ausland";

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
  height?: number; // optional, falls Wand abweichend von StandhÃ¶he
  /** Optisches Finish (Farbe/Print) aus der Admin-Materialbibliothek */
  finishId?: string;
};

export type WallPanelRules = {
  baseWidth: number;
  minWidth: number;
  maxWidth: number;
  /** Fallback-OberflÃ¤che fÃ¼r neu erzeugte Paneele */
  defaultSurface?: WallSurface;
};

export type WallPanelConfig = {
  id: string;
  width: number;
  height?: number;
  surface?: WallSurface;
  finishId?: string;
  /** true = Grundpaneel, darf in der UI nicht verschoben/verkleinert werden */
  locked?: boolean;
};

export type WallAttachmentBinding = {
  id: string;
  wall?: WallSide;
  floating: boolean;
  /** zuletzt bekannte Wand (fuer spaetere Wiederherstellung) */
  lastWall?: WallSide;
};

export type WallAttachmentIndex = {
  byWall: Record<WallSide, string[]>;
  floating: string[];
  /** neutrale Zielwand, auf die verschoben wurde (falls verfuegbar) */
  neutralWall?: WallSide;
  /** direkte Lookup-Tabelle pro Objekt */
  byId?: Record<string, WallAttachmentBinding>;
};

export type FloorType = "carpet" | "laminate" | "vinyl" | "wood";

export type FloorConfig = {
  type: FloorType;
  raised: boolean;
  /** Optionaler Verweis auf eine Material-Definition aus der Admin-Bibliothek */
  materialId?: string;
  colorVariant?: string;
  /** Optional: direkt eingebettete Textur (wenn keine Bibliothek genutzt wird) */
  textureUrl?: string;
  textureFileName?: string;
};

type AccessibilityConfig = {
  /** Markiert die Standflaeche als barrierefrei (Rampe, kontrastierte Zone) */
  barrierFree?: boolean;
  /** Ramplaenge Richtung Besucherbereich (Meter) */
  rampLength?: number;
};

// Kabine / Lagerraum
export type CabinDoorSide = "front" | "left" | "right" | "back";

export type CabinDoorConfig = {
  side: CabinDoorSide;
  width: number; // Meter (spÃ¤ter fÃ¼r groÃŸe Ã–ffnungen nutzbar)
};

export type CabinConfig = {
  enabled: boolean;
  width: number;
  depth: number;
  height: number;
  /** Optional unterschiedliche WandoberflÃ¤chen pro Seite */
  wallSurfaces?: Partial<Record<CabinDoorSide, WallSurface>>;

  /** Legacy: eine einfache TÃ¼rangabe (falls doors nicht genutzt wird) */
  doorSide?: CabinDoorSide;

  /** Position der Kabinenmitte relativ zur Standmitte (0/0) */
  position?: {
    x: number;
    z: number;
  };

  /** Optionale Liste an TÃ¼ren (einzeln oder mehrere / breite Ã–ffnung) */
  doors?: CabinDoorConfig[];
};

export type ScreenSize = "55" | "65" | "75";

export type ScreenConfig = {
  id: string;
  templateId?: string;
  screenSize?: ScreenSize;
  size?: { w?: number; h?: number; t?: number };
  mount?: "wall" | "truss" | "floor";
  wallSide?: WallSide;
  /** Markiert, dass die urspruengliche Wand fehlt und der Screen neu platziert werden muss */
  floating?: boolean;
  /** Merkt sich die zuletzt gueltige Wand zur spaeteren Wiederverwendung */
  lastWallSide?: WallSide;
  heightFromFloor?: number;
  unitPrice?: number;
  position?: {
    x: number;
    y?: number;
    z?: number;
  };
  rotationY?: number;
  /** Optionales Video pro Screen (nur Frontend; Pricing ignoriert) */
  videoUrl?: string;
  videoName?: string;
};

export type SeatingType = "chair" | "barstool" | "lounge";
export type SeatingCover = "none" | "white" | "branding";

type SeatingConfig = {
  type: SeatingType;
  count: number;
  cover: SeatingCover;
};

export type ChairConfig = {
  id: string;
  type?: SeatingType;
  cover?: SeatingCover;
  unitPrice?: number;
  rotationY?: number;
  seatHeight?: number;
  backHeight?: number;
  footprint?: {
    w?: number;
    d?: number;
  };
  color?: string;
  frameColor?: string;
  position: {
    x: number;
    z: number;
  };
};

// Frei importierte 3D-Objekte (z. B. GLB/GLTF)
export type CustomObjectConfig = {
  id: string;
  templateId?: string;
  name?: string;
  /** Data-URL oder externe URL des 3D-Modells */
  assetUrl: string;
  /** Urspruenglicher Dateiname, rein informativ */
  sourceFileName?: string;
  /** Einheitlicher Scale-Faktor fuer das geladene Modell */
  scale?: number;
  unitPrice?: number;
  rotationY?: number;
  footprint?: {
    w?: number;
    d?: number;
    h?: number;
  };
  position: {
    x: number;
    z: number;
    y?: number;
  };
};

export type RoundTableConfig = {
  id: string;
  /** Durchmesser in Metern */
  diameter?: number;
  /** Tischhoehe in Metern */
  height?: number;
  /** Optionaler Einzelpreis */
  unitPrice?: number;
  /** individuelle Farbe der TischoberflÃ¤che/Basis */
  color?: string;
  position: {
    x: number;
    z: number;
  };
};

export type TrussLightConfig = {
  id: string;
  side: "front" | "back" | "left" | "right";
  templateId?: string;
  unitPrice?: number;
  position?: {
    x?: number;
    z?: number;
  };
  color?: string;
};

export type WallLightConfig = {
  id: string;
  side: WallSide;
  templateId?: string;
  unitPrice?: number;
  position?: {
    x?: number;
    z?: number;
  };
  /** MontagehÃ¶he ab Boden (Meter) */
  heightFromFloor?: number;
  color?: string;
};

// Truss-Anbauteile
type TrussAttachmentType = "light" | "bannerFrame";

type TrussAttachmentConfig = {
  type: TrussAttachmentType;
  count: number;
};

type TrussConfig = {
  enabled: boolean;
  lengthX: number; // Meter
  lengthZ: number; // Meter
  height: number; // Meter
  attachments: TrussAttachmentConfig[];
};

export type CounterPlacement = "front" | "center" | "middle" | "island";

// Tresen / Counter (detailliert)
export type CounterVariant = "basic" | "premium" | "corner";

export type CounterConfig = {
  id: string;
  templateId?: string;
  variant: CounterVariant;
  /** Optisches Finish (Farbe/Dekor) aus der Admin-Materialbibliothek */
  finishId?: string;
  /** lokales Strom-Flag, ueberschreibt ggf. globales countersWithPower */
  withPower?: boolean;
  /** Position relativ zur Standmitte (0/0) */
  position: {
    x: number;
    z: number;
  };
  /** optionale Ausrichtung in Rad (Three.js: rotation-y) */
  rotationY?: number;
  /** optionale Masse */
  size?: { w?: number; d?: number; h?: number };
  /** optionaler Template-/Admin-Preis */
  unitPrice?: number;
  /** optionale Direktfarben fÃ¼r individuelle Tresen */
  colors?: {
    body?: string;
    accent?: string;
    top?: string;
  };
};

export type StandModules = {
  // Legacy-Felder
  wallsClosedSides: number;
  storageRoom: boolean;
  storageDoorSide?: WallSide;

  counters: number;
  countersWall?: CounterPlacement;
  countersWithPower?: boolean;
  counterVariant?: CounterVariant;
  /** Standard-Finish fï¿½r alle Tresen (Admin-Palette) */
  counterFinishId?: string;

  ledFrames?: number;
  ledFramesDetailed?: {
    id?: string;
    variant?: string;
    size?: number;
    color?: string;
    count?: number;
    position?: { x?: number; z?: number };
    rotationY?: number;
    height?: number;
    wallSide?: WallSide;
    floating?: boolean;
    lastWallSide?: WallSide;
    unitPrice?: number;
  }[];
  /** Legacy / Auswahl im UI: bevorzugte Wand f\u00fcr LED-Frames */
  ledWall?: WallSide;

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
  trussLightsDetailed?: TrussLightConfig[];

  wallLightsBack?: number;
  wallLightsLeft?: number;
  wallLightsRight?: number;
  wallLightsDetailed?: WallLightConfig[];

  // WÃ¤nde (fÃ¼r Advanced-Pricing)
  walls?: Partial<Record<WallSide, WallConfig>>;
  /** Detail-OberflÃ¤chen / SonderhÃ¶hen fÃ¼r 3D & Pricing */
  wallsDetail?: Partial<Record<WallSide, WallDetailConfig>>;
  /** Paneel-Regeln (Segmentbreiten usw.) */
  wallPanelRules?: Partial<WallPanelRules>;
  /** Individuelle Wandpaneele pro Seite */
  wallPanels?: Partial<Record<WallSide, WallPanelConfig[]>>;

  // Kabine
  cabin?: CabinConfig;

  // Boden
  floor?: FloorConfig;
  /** Barrierefreiheit/Markierung (Rampe, Kontrastzone) */
  accessibility?: AccessibilityConfig;
  // LED-/Rahmen-Konfiguration
  frameVariant?: string;
  frameSize?: number;
  frameColor?: string;
  activeBundles?: string[];

  // Screens & Seating
  detailedScreens?: ScreenConfig[];
  seating?: SeatingConfig[];
  chairsDetailed?: ChairConfig[];
  roundTables?: RoundTableConfig[];
  customObjects?: CustomObjectConfig[];
  /** Mindestabstand f\u00fcr Kollisionspr\u00fcfungen (Meter) */
  collisionClearance?: number;

  // Truss-Details (optional, falls spÃ¤ter genutzt)
  trussConfig?: TrussConfig;

  // weitere Truss-Infos aus UI
  trussBannersFront?: number;
  trussBannersBack?: number;
  trussBannersLeft?: number;
  trussBannersRight?: number;
  trussBannerWidth?: number;
  trussBannerHeight?: number;
  trussBannerMipmaps?: string[];
  trussBannerKtx2Url?: string;
  trussBannerWebpUrl?: string;
  trussBannerImageUrl?: string;
  trussHeightMode?: "absolute" | "offset";
  trussHeightOffset?: number;

  /** absolute Truss-HÃ¶he Ã¼ber Hallenboden (m), optional */
  trussHeight?: number;
  /** optionale XY-Verschiebung der Truss (Meter, relativ zur Standmitte) */
  trussOffset?: { x?: number; z?: number };

  /** neue, frei positionierbare Tresen */
  countersDetailed?: CounterConfig[];
  /** Index fuer Wand-Anhaenge (Screens, LED-Rahmen) */
  wallAttachmentIndex?: WallAttachmentIndex;

  lighting?: {
    ambientColor?: string;
    ambientIntensity?: number;
    environmentIntensity?: number;
    /** Globaler Roughness-Multiplikator (0..1 = glatter, >1 = matter) */
    materialRoughness?: number;
    /** Globaler Metallanteil (Multiplikator) */
    materialMetalness?: number;
    emissiveIntensity?: number;
    /** Auswahl der HDRI-Umgebung (UI) */
    hdri?: "hall" | "studio" | "outdoor";
    /** HDRI als Hintergrund rendern */
    background?: boolean;
    /** Exposure / Tone Mapping */
    exposure?: number;
    toneMapping?: "aces" | "agx" | "reinhard" | "neutral";
    /** Post-Processing */
    bloom?: boolean;
    bloomIntensity?: number;
    dof?: boolean;
    dofFocus?: number;
    dofBokehScale?: number;
    /** Spiegelungs-Staerke fuer glanzende Flaechen */
    envMapIntensity?: number;
  };
};

export type StandConfig = {
  width: number; // Meter
  depth: number; // Meter
  height: number; // Meter (Standard-WandhÃ¶he)
  type: StandType;
  region: Region;
  rush: boolean;
  modules: StandModules;
  /** Optionaler Paketbezug fuer Bundle-Presets */
  bundleKey?: string;
  bundleLabel?: string;
  bundleDiscount?: number;
};

// ======================
// Pricing-Modell (Headless/DB)
// ======================

import pricingDefaults from "../data/pricingModel.json" assert { type: "json" };
import { moduleVariantsByKey, moduleBundles } from "../services/modules";

type PricingCustomerProfile = {
  label?: string;
  discountPercent?: number;
  multiplier?: number;
};

type PricingModel = {
  base?: {
    hourlyRateOwn?: number;
    dayRate10h?: number;
    baseMaterialPerM2?: number;
    laborHoursPerM2?: number;
    rushSurchargePercent?: number;
    safetyMarginPercent?: number;
    rentalFactor?: number;
  };
  travelCostMap?: Partial<Record<Region, number>>;
  regionFactorMap?: Partial<Record<Region, number>>;
  legacy?: {
    wallBasePricePerM2?: number;
    storageRoomFlat?: number;
    counterPrices?: Partial<Record<CounterVariant, number>>;
    counterPowerSurcharge?: number;
    screenPriceLegacy?: number;
    raisedFloorSurchargePerM2?: number;
  };
  advanced?: {
    wallSurcharges?: Partial<Record<WallType, number>>;
    floorSurchargePerM2?: Partial<Record<FloorType, number>>;
    cabinPricePerM2?: number;
    cabinDoorPrice?: number;
    screenPriceBySize?: Partial<Record<ScreenSize, number>>;
    seatingBasePrice?: Partial<Record<SeatingType, number>>;
    seatingCoverSurcharge?: Partial<Record<SeatingCover, number>>;
    roundTablePrice?: number;
    trussMeterPrice?: number;
    trussLightPrice?: number;
    trussBannerFramePrice?: number;
    wallLightPrice?: number;
  };
  customers?: {
    defaultMultiplier?: number;
    profiles?: Record<string, PricingCustomerProfile>;
  };
  modules?: Record<string, unknown>;
};

type ResolvedPricing = {
  baseMaterialPerM2: number;
  laborHoursPerM2: number;
  hourlyRateOwn: number;
  dayRate10h: number;
  travelCostMap: Record<Region, number>;
  regionFactorMap: Record<Region, number>;
  wallBasePricePerM2: number;
  storageRoomFlat: number;
  counterPrices: Record<CounterVariant, number>;
  counterPowerSurcharge: number;
  screenPriceLegacy: number;
  raisedFloorSurchargePerM2: number;
  wallSurcharges: Record<WallType, number>;
  floorSurchargePerM2: Record<FloorType, number>;
  cabinPricePerM2: number;
  cabinDoorPrice: number;
  screenPriceBySize: Record<ScreenSize, number>;
  seatingBasePrice: Record<SeatingType, number>;
  seatingCoverSurcharge: Record<SeatingCover, number>;
  roundTablePrice: number;
  trussMeterPrice: number;
  trussLightPrice: number;
  trussBannerFramePrice: number;
  wallLightPrice: number;
  rushSurchargePercent: number;
  safetyMarginPercent: number;
  rentalFactor: number;
};

type PriceOptions = {
  customerId?: string;
  customerMultiplier?: number;
};

type PriceBreakdownModules = {
  legacy: {
    storage: number;
    counters: number;
    screens: number;
    raisedFloor: number;
    total: number;
  };
  advanced: {
    walls: number;
    floor: number;
    cabin: number;
    screens: number;
    frames: number;
    counters: number;
    seating: number;
    chairs: number;
    tables: number;
    custom: number;
    truss: number;
    lights: number;
    bundles: number;
    total: number;
  };
  total: number;
};

export type PriceBreakdown = {
  base: {
    material: number;
    labor: number;
    modules: PriceBreakdownModules;
    travel: number;
    subtotal: number;
  };
  surcharges: {
    regionFactor: number;
    regionAmount: number;
    rushPercent: number;
    rushAmount: number;
    marginPercent: number;
    marginAmount: number;
  };
  customer: {
    multiplier: number;
    adjustment: number;
    source: "default" | "override" | "profile";
    profileId?: string;
    profileLabel?: string;
  };
  discounts: {
    bundlePercent: number;
    bundleAmount: number;
    bundleLabel?: string;
  };
  optionalServices: { label: string; amount: number }[];
  purchaseTotal: number;
  rentalTotal: number;
  rentalFactor: number;
  total: number;
};

type PriceResult = {
  total: number;
  purchaseTotal: number;
  rentalTotal: number;
  breakdown: PriceBreakdown;
};

const DEFAULT_PRICING_MODEL: PricingModel = pricingDefaults as PricingModel;

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const deepMerge = <T extends PlainObject>(base: T, patch?: Partial<T>): T => {
  const out: PlainObject = { ...base };
  if (patch && isPlainObject(patch)) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const prev = out[key];
      if (isPlainObject(prev) && isPlainObject(value)) {
        out[key] = deepMerge(prev, value as PlainObject);
      } else {
        out[key] = value;
      }
    }
  }
  return out as T;
};

const mergePricingModel = (incoming?: PricingModel): PricingModel =>
  deepMerge(DEFAULT_PRICING_MODEL as PricingModel, incoming ?? {});

type CustomerMultiplier = {
  multiplier: number;
  source: "default" | "override" | "profile";
  profileId?: string;
  profileLabel?: string;
};

const resolveCustomerMultiplier = (
  model: PricingModel,
  customerId?: string,
  explicitMultiplier?: number
): CustomerMultiplier => {
  if (typeof explicitMultiplier === "number" && explicitMultiplier > 0) {
    return { multiplier: explicitMultiplier, source: "override" as const };
  }

  const customers = model.customers || {};
  const defaultMultiplier =
    typeof customers.defaultMultiplier === "number" && customers.defaultMultiplier > 0
      ? customers.defaultMultiplier
      : 1;

  if (!customerId) {
    return { multiplier: defaultMultiplier, source: "default" as const };
  }

  const profile = customers.profiles?.[customerId];
  if (!profile) {
    return { multiplier: defaultMultiplier, source: "default" as const };
  }

  const profileMultiplier =
    typeof profile.multiplier === "number" && profile.multiplier > 0
      ? profile.multiplier
      : typeof profile.discountPercent === "number"
      ? 1 - profile.discountPercent / 100
      : undefined;

  return {
    multiplier: profileMultiplier ?? defaultMultiplier,
    source: "profile" as const,
    profileId: customerId,
    profileLabel: profile.label,
  };
};

const SOUTH_ALIASES = ["Sued", "S\u00fcd", "S\u00c3\u00bcd"] as const;

const resolveSouthValue = <T>(
  map: Partial<Record<string, T | undefined>>,
  fallback: T
): T => {
  for (const key of SOUTH_ALIASES) {
    const value = map[key];
    if (value != null) return value;
  }
  return fallback;
};

const normalizeRegion = (region: string): Region => {
  if (region === "Nord" || region === "Ausland") return region;
  if (region === "Sued") return "Sued";
  if (region === "S\u00fcd" || region === "S\u00c3\u00bcd") return "S\u00fcd";
  return "NRW";
};

const resolvePricing = (model?: PricingModel): ResolvedPricing => {
  const merged = mergePricingModel(model);
  const base = merged.base ?? {};
  const legacy = merged.legacy ?? {};
  const advanced = merged.advanced ?? {};

  const travelCostSource = merged.travelCostMap ?? {};
  const southTravel = resolveSouthValue(travelCostSource, 0);
  const travelCostMap: Record<Region, number> = {
    NRW: travelCostSource.NRW ?? 0,
    Nord: travelCostSource.Nord ?? 0,
    Ausland: travelCostSource.Ausland ?? 0,
    Sued: southTravel,
    "S\u00fcd": southTravel,
  };

  const regionFactorSource = merged.regionFactorMap ?? {};
  const southFactor = resolveSouthValue(regionFactorSource, 1);
  const regionFactorMap: Record<Region, number> = {
    NRW: regionFactorSource.NRW ?? 1,
    Nord: regionFactorSource.Nord ?? 1,
    Ausland: regionFactorSource.Ausland ?? 1,
    Sued: southFactor,
    "S\u00fcd": southFactor,
  };

  return {
    baseMaterialPerM2: base.baseMaterialPerM2 ?? 0,
    laborHoursPerM2: base.laborHoursPerM2 ?? 1,
    hourlyRateOwn: base.hourlyRateOwn ?? 0,
    dayRate10h: base.dayRate10h ?? 0,
    rushSurchargePercent: base.rushSurchargePercent ?? 0,
    safetyMarginPercent: base.safetyMarginPercent ?? 0,
    travelCostMap,
    regionFactorMap,
    wallBasePricePerM2: legacy.wallBasePricePerM2 ?? 0,
    storageRoomFlat: legacy.storageRoomFlat ?? 0,
    counterPrices: {
      basic: legacy.counterPrices?.basic ?? 0,
      premium: legacy.counterPrices?.premium ?? 0,
      corner: legacy.counterPrices?.corner ?? 0,
    },
    counterPowerSurcharge: legacy.counterPowerSurcharge ?? 0,
    screenPriceLegacy: legacy.screenPriceLegacy ?? 0,
    raisedFloorSurchargePerM2: legacy.raisedFloorSurchargePerM2 ?? 0,
    wallSurcharges: {
      plain: 0,
      seg: 0,
      wood: advanced.wallSurcharges?.wood ?? 0,
      led: advanced.wallSurcharges?.led ?? 0,
      banner: advanced.wallSurcharges?.banner ?? 0,
    },
    floorSurchargePerM2: {
      carpet: 0,
      laminate: advanced.floorSurchargePerM2?.laminate ?? 0,
      vinyl: advanced.floorSurchargePerM2?.vinyl ?? 0,
      wood: advanced.floorSurchargePerM2?.wood ?? 0,
    },
    cabinPricePerM2: advanced.cabinPricePerM2 ?? 0,
    cabinDoorPrice: advanced.cabinDoorPrice ?? 0,
    screenPriceBySize: {
      "55": advanced.screenPriceBySize?.["55"] ?? 0,
      "65": advanced.screenPriceBySize?.["65"] ?? 0,
      "75": advanced.screenPriceBySize?.["75"] ?? 0,
    },
    seatingBasePrice: {
      chair: advanced.seatingBasePrice?.chair ?? 0,
      barstool: advanced.seatingBasePrice?.barstool ?? 0,
      lounge: advanced.seatingBasePrice?.lounge ?? 0,
    },
    seatingCoverSurcharge: {
      none: advanced.seatingCoverSurcharge?.none ?? 0,
      white: advanced.seatingCoverSurcharge?.white ?? 0,
      branding: advanced.seatingCoverSurcharge?.branding ?? 0,
    },
    roundTablePrice: advanced.roundTablePrice ?? 0,
    trussMeterPrice: advanced.trussMeterPrice ?? 0,
    trussLightPrice: advanced.trussLightPrice ?? 0,
    trussBannerFramePrice: advanced.trussBannerFramePrice ?? 0,
    wallLightPrice: advanced.wallLightPrice ?? 0,
    rentalFactor: base.rentalFactor ?? 1,
  };
};

// ======================
// Hilfsfunktionen
// ======================

function calcLaborCost(area: number, pricing: ResolvedPricing): number {
  const hours = area * pricing.laborHoursPerM2;

  if (hours >= 9) {
    const days = Math.ceil(hours / 10);
    return days * pricing.dayRate10h;
  } else {
    return hours * pricing.hourlyRateOwn;
  }
}

// Laenge einer Wandseite (zur Flaechenberechnung)
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

const counterVariantKeyMap: Record<CounterVariant, string> = {
  basic: "counter_basic",
  premium: "counter_premium",
  corner: "counter_corner",
};

const screenVariantKey = (screen: ScreenConfig): string => {
  const size = screen.screenSize ?? "55";
  const mount = screen.mount ?? "wall";
  return `screen_${mount}_${size}`;
};

type VariantCost = {
  total: number;
  perVariant: Record<string, { total: number; count: number }>;
};

type TrussCost = {
  structureCost: number;
  lightCost: number;
  total: number;
};

const calcBundleDiscount = (
  modules: StandModules,
  costs: {
    frames: VariantCost;
    screens: VariantCost;
    counters: VariantCost;
  }
): number => {
  const active = Array.isArray(modules.activeBundles) ? modules.activeBundles : [];
  if (!active.length) return 0;

  const variantBank: Record<string, { total: number; count: number }> = {
    ...costs.frames.perVariant,
    ...costs.screens.perVariant,
    ...costs.counters.perVariant,
  };

  let discount = 0;
  moduleBundles
    .filter((b) => active.includes(b.key))
    .forEach((bundle) => {
      const required = bundle.items ?? [];
      let bundleSum = 0;
      let valid = true;

      required.forEach((item) => {
        const entry = variantBank[item.variantKey];
        if (!entry || entry.count <= 0) {
          valid = false;
          return;
        }
        const requiredCount = item.quantity ?? 1;
        const unit = entry.total / Math.max(1, entry.count);
        bundleSum += unit * Math.min(entry.count, requiredCount);
      });

      if (valid && bundle.discountPercent) {
        discount += bundleSum * (bundle.discountPercent / 100);
      }
    });

  return discount;
};

const calcLegacyModuleBreakdown = (
  cfg: StandConfig,
  area: number,
  pricing: ResolvedPricing
): PriceBreakdownModules["legacy"] => {
  const m = cfg.modules;
  let storage = 0;
  let counters = 0;
  let screens = 0;
  let raisedFloor = 0;

  const useLegacyCabin = !m.cabin?.enabled;
  if (useLegacyCabin && m.storageRoom) {
    storage += pricing.storageRoomFlat;
  }

  const useLegacyCounters = !m.countersDetailed || m.countersDetailed.length === 0;
  if (useLegacyCounters) {
    const count = m.counters ?? 0;
    const variant = m.counterVariant ?? "basic";

    let basePrice = pricing.counterPrices.basic;
    if (variant === "premium") basePrice = pricing.counterPrices.premium;
    else if (variant === "corner") basePrice = pricing.counterPrices.corner;

    counters += count * basePrice;

    if (m.countersWithPower) {
      counters += count * pricing.counterPowerSurcharge;
    }
  }

  const useLegacyScreens = !m.detailedScreens || m.detailedScreens.length === 0;
  if (useLegacyScreens) {
    screens += (m.screens ?? 0) * pricing.screenPriceLegacy;
  }

  const useLegacyRaised = !m.floor?.raised;
  if (useLegacyRaised && m.raisedFloor) {
    raisedFloor += pricing.raisedFloorSurchargePerM2 * area;
  }

  const total = storage + counters + screens + raisedFloor;
  return { storage, counters, screens, raisedFloor, total };
};

const calcAdvancedModuleBreakdown = (
  cfg: StandConfig,
  pricing: ResolvedPricing
): PriceBreakdownModules["advanced"] => {
  const walls = calcAdvancedWallsCost(cfg, pricing);
  const floor = calcFloorCost(cfg, pricing);
  const cabin = calcCabinCost(cfg, pricing);
  const screenCost =
    cfg.modules.detailedScreens && cfg.modules.detailedScreens.length > 0
      ? calcDetailedScreensCostWithVariants(cfg.modules.detailedScreens, pricing)
      : { total: 0, perVariant: {} };
  const screens = screenCost.total;
  const counterCost =
    cfg.modules.countersDetailed && cfg.modules.countersDetailed.length > 0
      ? calcDetailedCountersCostWithVariants(
          cfg.modules.countersDetailed,
          cfg.modules.counterVariant,
          cfg.modules.countersWithPower,
          pricing
        )
      : { total: 0, perVariant: {} };
  const counters = counterCost.total;
  const framesData = calcFrameCost(cfg.modules);
  const bundles = calcBundleDiscount(cfg.modules, {
    frames: framesData,
    screens: screenCost,
    counters: counterCost,
  });
  const seating = calcSeatingCost(cfg.modules.seating, pricing);
  const chairs = calcChairCost(cfg.modules.chairsDetailed, pricing);
  const tables = calcRoundTableCost(cfg.modules.roundTables, pricing);
  const custom = calcCustomObjectsCost(cfg.modules.customObjects);
  const trussCost = calcTrussCost(cfg, pricing);
  const wallLights = calcWallLightsCost(cfg, pricing);
  const lights = trussCost.lightCost + wallLights;
  const truss = trussCost.structureCost;

  const total =
    walls +
    floor +
    cabin +
    screens +
    framesData.total +
    counters +
    seating +
    chairs +
    tables +
    custom +
    truss +
    lights -
    bundles;

  return {
    walls,
    floor,
    cabin,
    screens,
    frames: framesData.total,
    counters,
    seating,
    chairs,
    tables,
    custom,
    truss,
    lights,
    bundles: -bundles,
    total,
  };
};

// ======================
// Advanced-Modulkosten
// ======================

function calcAdvancedWallsCost(cfg: StandConfig, pricing: ResolvedPricing): number {
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
    const wallHeight = details[side]?.height ?? wallsConfig[side]?.height ?? baseHeight;
    const wallArea = length * wallHeight;

    sum += wallArea * pricing.wallBasePricePerM2;

    const wallType = mapSurfaceToWallType(details[side]?.surface);
    if (wallType === "wood") sum += wallArea * (pricing.wallSurcharges.wood ?? 0);
    else if (wallType === "led") sum += wallArea * (pricing.wallSurcharges.led ?? 0);
    else if (wallType === "banner") sum += wallArea * (pricing.wallSurcharges.banner ?? 0);
  });

  let panelArea = 0;
  Object.values(m.wallPanels ?? {}).forEach((panelList) => {
    (panelList ?? []).forEach((panel) => {
      if (!panel.locked) return;
      panelArea += panel.width * (panel.height ?? baseHeight);
    });
  });
  const panelSurface = m.wallPanelRules?.defaultSurface;
  if (panelArea > 0 && panelSurface) {
    const wallType = mapSurfaceToWallType(panelSurface);
    if (wallType === "wood") sum += panelArea * (pricing.wallSurcharges.wood ?? 0);
    else if (wallType === "led") sum += panelArea * (pricing.wallSurcharges.led ?? 0);
    else if (wallType === "banner") sum += panelArea * (pricing.wallSurcharges.banner ?? 0);
  }

  return sum;
}

function calcFloorCost(cfg: StandConfig, pricing: ResolvedPricing): number {
  const m = cfg.modules;
  const floor = m.floor;
  if (!floor) return 0;

  const area = cfg.width * cfg.depth;
  let sum = 0;

  switch (floor.type) {
    case "laminate":
      sum += area * (pricing.floorSurchargePerM2.laminate ?? 0);
      break;
    case "vinyl":
      sum += area * (pricing.floorSurchargePerM2.vinyl ?? 0);
      break;
    case "wood":
      sum += area * (pricing.floorSurchargePerM2.wood ?? 0);
      break;
    case "carpet":
    default:
      break;
  }

  if (floor.raised) {
    sum += area * pricing.raisedFloorSurchargePerM2;
  }

  return sum;
}

function calcCabinCost(cfg: StandConfig, pricing: ResolvedPricing): number {
  const cabin = cfg.modules.cabin;
  if (!cabin || !cabin.enabled) return 0;

  const area = cabin.width * cabin.depth;
  let sum = area * pricing.cabinPricePerM2;

  const explicitDoors = cabin.doors?.length ?? 0;
  const hasLegacyDoor = cabin.doorSide != null;
  const doorCount = explicitDoors > 0 ? explicitDoors : hasLegacyDoor ? 1 : 0;
  if (doorCount > 0) {
    sum += doorCount * pricing.cabinDoorPrice;
  }

  if (cabin.height > 2.5) {
    const extraHeight = cabin.height - 2.5;
    sum *= 1 + extraHeight * 0.08;
  }

  return sum;
}

function calcSeatingCost(
  seating: SeatingConfig[] | undefined,
  pricing: ResolvedPricing
): number {
  if (!seating || seating.length === 0) return 0;

  let sum = 0;
  for (const s of seating) {
    const base = pricing.seatingBasePrice[s.type];
    const cover = pricing.seatingCoverSurcharge[s.cover];
    sum += s.count * (base + cover);
  }

  return sum;
}

function calcChairCost(
  chairs: ChairConfig[] | undefined,
  pricing: ResolvedPricing
): number {
  if (!chairs || chairs.length === 0) return 0;

  let sum = 0;
  for (const chair of chairs) {
    if (chair.unitPrice != null) {
      sum += chair.unitPrice;
      continue;
    }

    const type = chair.type ?? "chair";
    const cover = chair.cover ?? "none";
    const base = pricing.seatingBasePrice[type] ?? pricing.seatingBasePrice.chair;
    const coverCost = pricing.seatingCoverSurcharge[cover] ?? 0;
    sum += base + coverCost;
  }
  return sum;
}

function calcRoundTableCost(
  tables: RoundTableConfig[] | undefined,
  pricing: ResolvedPricing
): number {
  if (!tables || tables.length === 0) return 0;

  return tables.reduce((acc, table) => {
    if (typeof table.unitPrice === "number") return acc + table.unitPrice;
    return acc + pricing.roundTablePrice;
  }, 0);
}

function calcCustomObjectsCost(custom: CustomObjectConfig[] | undefined): number {
  if (!custom || custom.length === 0) return 0;

  return custom.reduce((sum, obj) => {
    if (typeof obj.unitPrice === "number") return sum + obj.unitPrice;
    return sum;
  }, 0);
}

function calcWallLightsCost(cfg: StandConfig, pricing: ResolvedPricing): number {
  const m = cfg.modules;

  const detailed = m.wallLightsDetailed;
  if (Array.isArray(detailed) && detailed.length > 0) {
    return detailed.reduce((sum, light) => {
      const custom = typeof light.unitPrice === "number" ? light.unitPrice : pricing.wallLightPrice;
      return sum + custom;
    }, 0);
  }

  const legacyTotal =
    (m.wallLightsBack ?? 0) + (m.wallLightsLeft ?? 0) + (m.wallLightsRight ?? 0);

  return legacyTotal * pricing.wallLightPrice;
}

function calcFrameCost(modules: StandModules): VariantCost {
  const frames = Array.isArray(modules.ledFramesDetailed) ? [...modules.ledFramesDetailed] : [];
  if (frames.length === 0 && modules.frameVariant) {
    frames.push({
      variant: modules.frameVariant,
      size: modules.frameSize,
      color: modules.frameColor,
      count: Math.max(1, modules.ledFrames ?? 1),
    });
  }

  const result: VariantCost = { total: 0, perVariant: {} };

  frames.forEach((frame) => {
    if (!frame.variant) return;
    const def = moduleVariantsByKey[frame.variant];
    if (!def) return;
    const count = Math.max(1, Number(frame.count) || 1);

    let base =
      typeof frame.unitPrice === "number" ? frame.unitPrice : typeof def.basePrice === "number" ? def.basePrice : 0;
    if (def.sizes && def.sizes.length && frame.size) {
      const ref = def.sizes[0];
      if (ref) {
        const factor = frame.size / ref;
        if (Number.isFinite(factor) && factor > 0) {
          base = base * factor;
        }
      }
    }

    const variantTotal = base * count;
    result.total += variantTotal;

    const current = result.perVariant[def.key] ?? { total: 0, count: 0 };
    result.perVariant[def.key] = {
      total: current.total + variantTotal,
      count: current.count + count,
    };
  });

  return result;
}

function calcDetailedCountersCostWithVariants(
  counters: CounterConfig[],
  defaultVariant: CounterVariant | undefined,
  defaultWithPower: boolean | undefined,
  pricing: ResolvedPricing
): VariantCost {
  const res: VariantCost = { total: 0, perVariant: {} };

  for (const c of counters) {
    const variant = c.variant ?? defaultVariant ?? "basic";
    const key = counterVariantKeyMap[variant];

    let base = pricing.counterPrices.basic;
    if (variant === "premium") base = pricing.counterPrices.premium;
    else if (variant === "corner") base = pricing.counterPrices.corner;

    const withPower = c.withPower ?? defaultWithPower ?? false;
    let total = typeof c.unitPrice === "number" ? c.unitPrice : base;
    if (withPower) total += pricing.counterPowerSurcharge;

    res.total += total;
    const current = res.perVariant[key] ?? { total: 0, count: 0 };
    res.perVariant[key] = { total: current.total + total, count: current.count + 1 };
  }

  return res;
}

function calcDetailedScreensCostWithVariants(
  screens: ScreenConfig[],
  pricing: ResolvedPricing
): VariantCost {
  const res: VariantCost = { total: 0, perVariant: {} };
  for (const s of screens) {
    if (typeof s.unitPrice === "number") {
      res.total += s.unitPrice;
      const key = screenVariantKey(s);
      const current = res.perVariant[key] ?? { total: 0, count: 0 };
      res.perVariant[key] = { total: current.total + s.unitPrice, count: current.count + 1 };
      continue;
    }

    const size = s.screenSize ?? "55";
    const base = pricing.screenPriceBySize[size] ?? 0;
    res.total += base;
    const key = screenVariantKey(s);
    const current = res.perVariant[key] ?? { total: 0, count: 0 };
    res.perVariant[key] = { total: current.total + base, count: current.count + 1 };
  }
  return res;
}

function calcTrussCost(cfg: StandConfig, pricing: ResolvedPricing): TrussCost {
  const m = cfg.modules;
  const hasTrussFlag = !!m.truss || !!m.trussConfig?.enabled;
  if (!hasTrussFlag) {
    return { structureCost: 0, lightCost: 0, total: 0 };
  }

  const perimeter =
    m.trussConfig?.lengthX && m.trussConfig?.lengthZ
      ? 2 * (m.trussConfig.lengthX + m.trussConfig.lengthZ)
      : 2 * (cfg.width + cfg.depth);

  const structureBase = perimeter * pricing.trussMeterPrice;

  let frameCount = 0;
  let attachmentLights = 0;
  if (m.trussConfig?.attachments) {
    for (const att of m.trussConfig.attachments) {
      if (att.type === "light") attachmentLights += att.count;
      if (att.type === "bannerFrame") frameCount += att.count;
    }
  }

  const splitFrames =
    (m.trussBannersFront ?? 0) +
    (m.trussBannersBack ?? 0) +
    (m.trussBannersLeft ?? 0) +
    (m.trussBannersRight ?? 0);
  frameCount += splitFrames;
  const frameCost = frameCount * pricing.trussBannerFramePrice;

  const detailedLights = Array.isArray(m.trussLightsDetailed)
    ? (m.trussLightsDetailed ?? [])
    : [];

  let lightCost = 0;
  if (detailedLights.length > 0) {
    lightCost += detailedLights.reduce((sum, light) => {
      const custom = typeof light.unitPrice === "number" ? light.unitPrice : pricing.trussLightPrice;
      return sum + custom;
    }, 0);
  } else {
    const splitLights =
      (m.trussLightsFront ?? 0) +
      (m.trussLightsBack ?? 0) +
      (m.trussLightsLeft ?? 0) +
      (m.trussLightsRight ?? 0);
    const legacyLights = m.trussLights ?? 0;
    const countedLights = splitLights + legacyLights;
    lightCost += countedLights * pricing.trussLightPrice;
  }

  if (attachmentLights > 0) {
    lightCost += attachmentLights * pricing.trussLightPrice;
  }

  const heightFactor =
    cfg.modules.trussHeight && cfg.modules.trussHeight > 4
      ? 1 + (cfg.modules.trussHeight - 4) * 0.05
      : 1;

  const structureCost = (structureBase + frameCost) * heightFactor;
  const scaledLightCost = lightCost * heightFactor;
  const total = structureCost + scaledLightCost;

  return { structureCost, lightCost: scaledLightCost, total };
}

// ======================
// Hauptfunktion
// ======================

export function calcPriceDetailed(
  cfg: StandConfig,
  pricingModel?: PricingModel,
  options?: PriceOptions
): PriceResult {
  const mergedModel = mergePricingModel(pricingModel);
  const pricing = resolvePricing(mergedModel);
  const customer = resolveCustomerMultiplier(
    mergedModel,
    options?.customerId,
    options?.customerMultiplier
  );
  const area = cfg.width * cfg.depth;
  const resolveRegionValue = (map: Record<Region, number>) => {
    const region = normalizeRegion(cfg.region);
    if (region === "Sued" || region === "S\u00fcd") {
      return resolveSouthValue(map, map.NRW ?? 0);
    }
    return map[region] ?? map.NRW ?? 0;
  };

  const materialCost = area * pricing.baseMaterialPerM2;
  const laborCost = calcLaborCost(area, pricing);

  const legacyModules = calcLegacyModuleBreakdown(cfg, area, pricing);
  const advancedModules = calcAdvancedModuleBreakdown(cfg, pricing);
  const modulesTotal = legacyModules.total + advancedModules.total;

  const travelCost = resolveRegionValue(pricing.travelCostMap);

  const baseSubtotal = materialCost + laborCost + modulesTotal + travelCost;

  const regionFactor = resolveRegionValue(pricing.regionFactorMap) || 1;
  const regionAmount = baseSubtotal * (regionFactor - 1);
  const afterRegion = baseSubtotal + regionAmount;

  const rushPercent = cfg.rush ? pricing.rushSurchargePercent : 0;
  const rushAmount = afterRegion * rushPercent;
  const afterRush = afterRegion + rushAmount;

  const marginPercent = pricing.safetyMarginPercent;
  const marginAmount = afterRush * marginPercent;
  const afterMargin = afterRush + marginAmount;

  const customerAdjustment = afterMargin * (customer.multiplier - 1);
  const purchaseBeforeBundle = afterMargin + customerAdjustment;
  const bundlePercentRaw = typeof cfg.bundleDiscount === "number" ? cfg.bundleDiscount : 0;
  const bundlePercent = Math.max(0, Math.min(bundlePercentRaw, 0.99));
  const bundleAmount = purchaseBeforeBundle * bundlePercent;
  const purchaseTotal = purchaseBeforeBundle - bundleAmount;

  const rentalTotal = purchaseTotal * (pricing.rentalFactor ?? 1);

  const breakdown: PriceBreakdown = {
    base: {
      material: materialCost,
      labor: laborCost,
      modules: {
        legacy: legacyModules,
        advanced: advancedModules,
        total: modulesTotal,
      },
      travel: travelCost,
      subtotal: baseSubtotal,
    },
    surcharges: {
      regionFactor,
      regionAmount,
      rushPercent,
      rushAmount,
      marginPercent,
      marginAmount,
    },
    customer: {
      multiplier: customer.multiplier,
      adjustment: customerAdjustment,
      source: customer.source,
      profileId: customer.profileId,
      profileLabel: customer.profileLabel,
    },
    discounts: {
      bundlePercent,
      bundleAmount,
      bundleLabel: cfg.bundleLabel ?? cfg.bundleKey,
    },
    optionalServices: rushPercent > 0 ? [{ label: "Eilservice", amount: rushAmount }] : [],
    purchaseTotal: Math.round(purchaseTotal),
    rentalTotal: Math.round(rentalTotal),
    rentalFactor: pricing.rentalFactor ?? 1,
    total: Math.round(purchaseTotal),
  };

  return {
    total: breakdown.total,
    purchaseTotal: breakdown.purchaseTotal,
    rentalTotal: breakdown.rentalTotal,
    breakdown,
  };
}

export function calcPrice(
  cfg: StandConfig,
  pricingModel?: PricingModel,
  options?: PriceOptions
): number {
  return calcPriceDetailed(cfg, pricingModel, options).total;
}
