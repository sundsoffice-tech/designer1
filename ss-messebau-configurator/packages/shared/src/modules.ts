type ColliderType = "aabb" | "obb" | "mesh";

type Dimensions3D = {
  width?: number;
  depth?: number;
  height?: number;
  thickness?: number;
};

export type ModuleKind =
  | "counter"
  | "screen"
  | "truss"
  | "wall"
  | "wall_segment"
  | "frame"
  | "cabin"
  | "custom"
  | string;

export const MODULE_KEYS = {
  WALL_SEGMENT: "wall_segment",
  CABIN: "cabin",
};

type ModuleVariant = {
  key: string;
  name: string;
  variant?: string;
  sizes?: number[];
  colors?: string[];
  basePrice?: number;
  collider?: ColliderType;
  defaultColor?: string;
  clearance?: number;
  tags?: string[];
  dimensions?: Dimensions3D;
  screenSize?: string;
  mount?: "wall" | "truss" | "floor";
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

/** Struktur pro Modul-Familie wie in modules.json hinterlegt. */
export type ModuleDefinition = {
  module: string;
  label?: string;
  kind: ModuleKind;
  description?: string;
  variants: ModuleVariant[];
  compatibleWith?: Record<string, string[]>;
  notes?: string;
};

type ModuleBundleItem = {
  variantKey: string;
  quantity?: number;
  notes?: string;
};

export type ModuleBundle = {
  key: string;
  label: string;
  description?: string;
  items: ModuleBundleItem[];
  discountPercent?: number;
};

export type ModuleCatalog = {
  modules: ModuleDefinition[];
  bundles?: ModuleBundle[];
};

/** Variante mit angereichertem Kontext (Modulname/Kategorie) fǬr schnelle Lookups. */
export type ResolvedModuleVariant = ModuleVariant & {
  module: string;
  moduleLabel?: string;
  kind: ModuleKind;
};

export type ModuleVariantMap = Record<string, ResolvedModuleVariant>;
export type ModuleCompatibilityIndex = Record<string, Record<string, string[]>>;

export type ModelAttachmentPoint = { x: number; y?: number; z: number; label?: string };

type BaseModelModule = {
  id: string;
  name: string;
  category?: string;
  modelPath: string;
  width: number;
  depth: number;
  height: number;
  clearance?: number;
  attachmentPoints?: ModelAttachmentPoint[];
  weight?: number;
  price?: number;
  createdAt?: number;
  sourceFileName?: string;
};

export type CustomModelModule = BaseModelModule & {
  type: "custom";
};

export type CatalogEntry = CustomModelModule | LampModule;

export type CustomModelCatalog = CatalogEntry[];

export type LampModule = BaseModelModule & {
  type: "lamp";
  intensity?: number;
  color?: string;
  distance?: number;
  angle?: number;
  decay?: number;
  mount?: "floor" | "truss" | "wall";
  wallSide?: "back" | "left" | "right" | "front";
  heightFromFloor?: number;
  spot?: boolean;
};
