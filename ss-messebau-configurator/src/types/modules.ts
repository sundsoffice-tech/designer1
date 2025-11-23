type ColliderType = "aabb" | "obb" | "mesh";

type Dimensions3D = {
  width?: number;
  depth?: number;
  height?: number;
  thickness?: number;
};

export type ModuleKind = "counter" | "screen" | "truss" | "wall" | "frame" | "custom" | string;

type ModuleVariant = {
  key: string;
  name: string;
  variant?: string;
  sizes?: number[];
  colors?: string[];
  basePrice?: number;
  collider?: ColliderType;
  defaultColor?: string;
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
