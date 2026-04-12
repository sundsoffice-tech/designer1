import type { TextureFit } from "./textures.js";

// ======================
// Grundtypen
// ======================

export type StandType = "row" | "corner" | "head" | "island";
export type Region = "NRW" | "Sued" | "Süd" | "Nord" | "Ausland" | string;
export type WallSide = "back" | "left" | "right" | "front";
export type WallType = "plain" | "wood" | "led" | "banner" | "seg";
export type WallSurface = "system" | "wood" | "banner" | "seg" | "led";
export type FloorType = "carpet" | "laminate" | "vinyl" | "wood";
export type ScreenSize = "55" | "65" | "75";
export type SeatingType = "chair" | "barstool" | "lounge";
export type SeatingCover = "none" | "white" | "branding";
export type CounterPlacement = "front" | "center" | "middle" | "island";
export type CounterVariant = "basic" | "premium" | "corner";
export type CabinDoorSide = "front" | "left" | "right" | "back";

// ======================
// Wand-Konfiguration
// ======================

export type WallConfig = {
  closed: boolean;
  type: WallType;
  height: number;
};

export type WallDetailConfig = {
  surface?: WallSurface;
  height?: number;
  finishId?: string;
  textureUrl?: string;
  textureFit?: TextureFit;
  textureRepeat?: [number, number];
};

export type WallPanelRules = {
  baseWidth: number;
  minWidth: number;
  maxWidth: number;
  defaultHeight?: number;
  defaultSurface?: WallSurface;
};

export type WallPanelConfig = {
  id: string;
  width: number;
  height?: number;
  surface?: WallSurface;
  finishId?: string;
  locked?: boolean;
};

export type WallAttachmentBinding = {
  id: string;
  wall?: WallSide;
  floating: boolean;
  lastWall?: WallSide;
};

export type WallAttachmentIndex = {
  byWall: Record<WallSide, string[]>;
  floating: string[];
  neutralWall?: WallSide;
  byId?: Record<string, WallAttachmentBinding>;
};

// ======================
// Boden
// ======================

export type FloorConfig = {
  type: FloorType;
  raised: boolean;
  materialId?: string;
  colorVariant?: string;
  textureUrl?: string;
  textureFileName?: string;
  textureFit?: TextureFit;
  textureRepeat?: [number, number];
};

// ======================
// Kabine
// ======================

export type CabinDoorConfig = {
  side: CabinDoorSide;
  width: number;
};

export type CabinConfig = {
  enabled: boolean;
  width: number;
  depth: number;
  height: number;
  wallSurfaces?: Partial<Record<CabinDoorSide, WallSurface>>;
  doorSide?: CabinDoorSide;
  position?: { x: number; z: number };
  rotationY?: number;
  doors?: CabinDoorConfig[];
  clearance?: number;
};

// ======================
// Screens
// ======================

export type ScreenConfig = {
  id: string;
  templateId?: string;
  screenSize?: ScreenSize;
  size?: { w?: number; h?: number; t?: number };
  mount?: "wall" | "truss" | "floor";
  wallSide?: WallSide;
  floating?: boolean;
  lastWallSide?: WallSide;
  heightFromFloor?: number;
  unitPrice?: number;
  position?: { x: number; y?: number; z?: number };
  rotationY?: number;
  videoUrl?: string;
  videoName?: string;
  videoMuted?: boolean;
  videoVolume?: number;
  videoPaused?: boolean;
  clearance?: number;
};

// ======================
// Sitzmoebel
// ======================

export type SeatingConfig = {
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
  footprint?: { w?: number; d?: number };
  color?: string;
  frameColor?: string;
  position: { x: number; z: number };
  clearance?: number;
};

export type RoundTableConfig = {
  id: string;
  diameter?: number;
  height?: number;
  unitPrice?: number;
  color?: string;
  position: { x: number; z: number };
};

// ======================
// Tresen
// ======================

export type CounterConfig = {
  id: string;
  templateId?: string;
  variant: CounterVariant;
  finishId?: string;
  withPower?: boolean;
  position: { x: number; z: number };
  rotationY?: number;
  size?: { w?: number; d?: number; h?: number };
  unitPrice?: number;
  colors?: { body?: string; accent?: string; top?: string };
  clearance?: number;
};

// ======================
// Custom-Objekte & Lampen
// ======================

export type CustomObjectConfig = {
  id: string;
  templateId?: string;
  name?: string;
  assetUrl: string;
  sourceFileName?: string;
  scale?: number;
  unitPrice?: number;
  rotationY?: number;
  footprint?: { w?: number; d?: number; h?: number };
  clearance?: number;
  snapPoints?: { x: number; y?: number; z: number }[];
  weight?: number;
  modelId?: string;
  position: { x: number; z: number; y?: number };
};

export type LampConfig = {
  id: string;
  name?: string;
  assetUrl: string;
  modelId?: string;
  mount?: "floor" | "truss" | "wall";
  wallSide?: WallSide;
  position: { x: number; z: number; y?: number };
  rotationY?: number;
  heightFromFloor?: number;
  footprint?: { w?: number; d?: number; h?: number };
  clearance?: number;
  snapPoints?: { x: number; y?: number; z: number }[];
  intensity?: number;
  color?: string;
  distance?: number;
  angle?: number;
  decay?: number;
  spot?: boolean;
};

// ======================
// Beleuchtung
// ======================

export type TrussLightConfig = {
  id: string;
  side: "front" | "back" | "left" | "right";
  templateId?: string;
  unitPrice?: number;
  position?: { x?: number; z?: number };
  color?: string;
};

export type WallLightConfig = {
  id: string;
  side: WallSide;
  templateId?: string;
  unitPrice?: number;
  position?: { x?: number; z?: number };
  heightFromFloor?: number;
  color?: string;
};

// ======================
// Truss
// ======================

type TrussAttachmentType = "light" | "bannerFrame";

type TrussAttachmentConfig = {
  type: TrussAttachmentType;
  count: number;
};

type TrussConfig = {
  enabled: boolean;
  lengthX: number;
  lengthZ: number;
  height: number;
  attachments: TrussAttachmentConfig[];
};

type AccessibilityConfig = {
  barrierFree?: boolean;
  rampLength?: number;
};

// ======================
// StandModules — zentraler Typ fuer den gesamten Modulzustand
// ======================

export type StandModules = {
  // Waende (Legacy + Detail)
  wallsClosedSides?: number;
  wallHeight?: number;
  walls?: Partial<Record<WallSide, WallConfig>>;
  wallsDetail?: Partial<Record<WallSide, WallDetailConfig>>;
  wallPanelRules?: Partial<WallPanelRules>;
  wallPanels?: Partial<Record<WallSide, WallPanelConfig[]>>;
  wallAttachmentIndex?: WallAttachmentIndex;

  // Kabine
  cabin?: CabinConfig;
  cabinSize?: { width: number; depth: number; height?: number };
  cabinDoorPosition?: WallSide;
  storageRoom?: boolean;
  storageDoorSide?: WallSide;

  // Boden
  floor?: FloorConfig;
  raisedFloor?: boolean;
  accessibility?: AccessibilityConfig;

  // Tresen
  counters?: number;
  countersWall?: CounterPlacement;
  countersWithPower?: boolean;
  counterVariant?: CounterVariant;
  counterFinishId?: string;
  countersDetailed?: CounterConfig[];

  // LED-Rahmen
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
  ledWall?: WallSide;
  frameVariant?: string;
  frameSize?: number;
  frameColor?: string;

  // Screens
  screens?: number;
  screensWall?: WallSide;
  detailedScreens?: ScreenConfig[];

  // Sitzmoebel
  seating?: SeatingConfig[];
  chairsDetailed?: ChairConfig[];
  roundTables?: RoundTableConfig[];

  // Custom-Objekte & Lampen
  customObjects?: CustomObjectConfig[];
  lamps?: LampConfig[];

  // Truss
  truss?: boolean;
  trussConfig?: TrussConfig;
  trussHeight?: number;
  trussHeightMode?: "absolute" | "offset";
  trussHeightOffset?: number;
  trussSegmentLength?: number;
  trussOffset?: { x?: number; z?: number };
  trussLights?: number;
  trussLightsFront?: number;
  trussLightsBack?: number;
  trussLightsLeft?: number;
  trussLightsRight?: number;
  trussLightType?: "spot" | "wash";
  trussLightsDetailed?: TrussLightConfig[];
  trussClearance?: number;
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

  // Wandleuchten
  wallLightsBack?: number;
  wallLightsLeft?: number;
  wallLightsRight?: number;
  wallLightsDetailed?: WallLightConfig[];

  // Beleuchtung (Szene)
  lighting?: {
    ambientColor?: string;
    ambientIntensity?: number;
    environmentIntensity?: number;
    materialRoughness?: number;
    materialMetalness?: number;
    emissiveIntensity?: number;
    hdri?: "hall" | "studio" | "outdoor";
    background?: boolean;
    exposure?: number;
    toneMapping?: "aces" | "agx" | "reinhard" | "neutral";
    bloom?: boolean;
    bloomIntensity?: number;
    dof?: boolean;
    dofFocus?: number;
    dofBokehScale?: number;
    envMapIntensity?: number;
  };

  // Bundles
  activeBundles?: string[];

  // Kollision & Grid
  collisionClearance?: number;
  gridStep?: number;
  snapStep?: number;
  snapToStructure?: boolean;
};

// ======================
// StandConfig — Hauptkonfiguration
// ======================

export type StandConfig = {
  width: number;
  depth: number;
  height: number;
  type: StandType;
  region?: Region;
  rush?: boolean;
  modules: StandModules;
  traverseHeight?: number;
  bundleKey?: string;
  bundleLabel?: string;
  bundleDiscount?: number;
};

export type ContactRequest = {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  fair?: string;
  message?: string;
};
