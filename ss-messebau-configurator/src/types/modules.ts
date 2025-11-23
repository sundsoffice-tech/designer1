import { z } from "zod";

export type ColliderType = "aabb" | "obb" | "mesh";

export type Dimensions3D = {
  width?: number;
  depth?: number;
  height?: number;
  thickness?: number;
};

export type ModuleKind = "counter" | "screen" | "truss" | "wall" | "frame" | "custom" | string;

export type ModuleVariant = {
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

export type ModuleBundleItem = {
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

/**
 * Typed representation of the simplified modules.json under src/data/data.
 * Uses zod for runtime validation plus static inference.
 */
export const ledFrameVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  sizes: z.array(z.number()),
  colors: z.array(z.string()),
  basePrice: z.number(),
  supportsLedWall: z.boolean(),
  requires: z.record(z.string(), z.boolean()).optional(),
});
export type LedFrameVariant = z.infer<typeof ledFrameVariantSchema>;

export const counterVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number(),
  depth: z.number(),
  height: z.number(),
  colors: z.array(z.string()),
  price: z.number(),
  withPowerOption: z.boolean().optional(),
});
export type CounterVariant = z.infer<typeof counterVariantSchema>;

export const screenVariantSchema = z.object({
  size: z.number(),
  price: z.number(),
});
export type ScreenVariant = z.infer<typeof screenVariantSchema>;

export const trussSchema = z.object({
  heights: z.array(z.number()),
  lightTypes: z.array(z.string()),
  pricePerMeter: z.number(),
});
export type TrussModule = z.infer<typeof trussSchema>;

export const moduleDataSchema = z.object({
  ledFrame: z.object({
    variants: z.array(ledFrameVariantSchema),
  }),
  counter: z.object({
    variants: z.array(counterVariantSchema),
  }),
  screen: z.object({
    variants: z.array(screenVariantSchema),
  }),
  truss: trussSchema,
});
export type ModuleData = z.infer<typeof moduleDataSchema>;

const modulesJsonUrl = new URL("../data/data/modules.json", import.meta.url);

/** Fetch and validate modules.json as typed ModuleData. */
export async function loadModules(): Promise<ModuleData> {
  const res = await fetch(modulesJsonUrl.href);
  if (!res.ok) {
    throw new Error(`Failed to load modules.json (${res.status} ${res.statusText})`);
  }
  const json = await res.json();
  return moduleDataSchema.parse(json);
}
