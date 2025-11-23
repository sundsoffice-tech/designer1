import type { StandConfig } from "../lib/pricing";
import { getAllowedWalls } from "../store/configStore";
import type {
  ModuleCatalog,
  ModuleData,
  ModuleDefinition,
  ModuleVariant,
} from "../types/modules";

export type AllowedModuleType = "ledFrame" | "counter" | "screen" | "truss";

type NormalizedModule = Pick<ModuleDefinition, "module" | "variants" | "compatibleWith">;

type AllowedOptionsResult = {
  variants: ModuleVariant[];
  sizes: number[];
  colors: string[];
};

const isCatalog = (data: ModuleData | ModuleCatalog): data is ModuleCatalog =>
  Array.isArray((data as ModuleCatalog | undefined)?.modules);

const normalizeLegacyData = (data: ModuleData): NormalizedModule[] => {
  const list: NormalizedModule[] = [];

  const ledFrameVariants = data.ledFrame?.variants ?? [];
  list.push({
    module: "ledFrame",
    variants: ledFrameVariants.map((variant) => ({
      key: variant.id,
      name: variant.name,
      sizes: variant.sizes,
      colors: variant.colors,
      basePrice: variant.basePrice,
      metadata: { supportsLedWall: variant.supportsLedWall, requires: variant.requires },
    })),
    compatibleWith:
      ledFrameVariants.filter((variant) => variant.supportsLedWall).length > 0
        ? {
            ledWall: ledFrameVariants
              .filter((variant) => variant.supportsLedWall)
              .map((variant) => variant.id),
          }
        : undefined,
  });

  const counterVariants = data.counter?.variants ?? [];
  list.push({
    module: "counter",
    variants: counterVariants.map((variant) => ({
      key: `counter_${variant.id}`,
      name: variant.name,
      variant: variant.id,
      colors: variant.colors,
      dimensions: { width: variant.width, depth: variant.depth, height: variant.height },
      basePrice: variant.price,
    })),
    compatibleWith:
      counterVariants.filter((variant) => variant.withPowerOption !== false).length > 0
        ? {
            powerAddon: counterVariants
              .filter((variant) => variant.withPowerOption !== false)
              .map((variant) => `counter_${variant.id}`),
          }
        : undefined,
  });

  const screenVariants = data.screen?.variants ?? [];
  list.push({
    module: "screen",
    variants: screenVariants.map((variant) => ({
      key: `screen_wall_${variant.size}`,
      name: `${variant.size}"`,
      variant: String(variant.size),
      screenSize: String(variant.size),
      mount: "wall",
      basePrice: variant.price,
    })),
  });

  const trussHeights = data.truss?.heights ?? [];
  list.push({
    module: "truss",
    variants:
      trussHeights.length > 0
        ? trussHeights.map((height, idx) => ({
            key: `truss_${idx}`,
            name: `Truss ${height.toFixed(1)}m`,
            dimensions: { height },
          }))
        : [
            {
              key: "truss_default",
              name: "Truss",
            },
          ],
  });

  return list;
};

const normalizeData = (
  data: ModuleData | ModuleCatalog | null | undefined
): NormalizedModule[] => {
  if (!data) return [];
  if (isCatalog(data)) {
    return (data.modules ?? []).map((mod) => ({
      module: mod.module,
      variants: mod.variants,
      compatibleWith: mod.compatibleWith,
    }));
  }
  return normalizeLegacyData(data as ModuleData);
};

const normalizeCompatibility = (
  compat?: Record<string, unknown>
): Record<string, string[]> => {
  if (!compat) return {};
  return Object.entries(compat).reduce<Record<string, string[]>>((acc, [key, value]) => {
    if (Array.isArray(value)) {
      acc[key] = value.filter((item): item is string => typeof item === "string");
    } else if (typeof value === "string") {
      acc[key] = [value];
    }
    return acc;
  }, {});
};

const hasLedWallSurface = (cfg: StandConfig): boolean => {
  const wallsDetail = ((cfg.modules as any).wallsDetail ?? {}) as Record<
    string,
    { surface?: string }
  >;
  return (["back", "left", "right"] as const).some(
    (side) => wallsDetail?.[side]?.surface === "led"
  );
};

const collectUniqueNumbers = (values: number[]): number[] => {
  const seen = new Set<number>();
  const result: number[] = [];
  values.forEach((value) => {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  });
  return result;
};

const collectUniqueStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  });
  return result;
};

export function getAllowedOptions(
  data: ModuleData | ModuleCatalog | null | undefined,
  config: StandConfig,
  moduleType: AllowedModuleType
): AllowedOptionsResult {
  const modules = normalizeData(data);
  const moduleDef = modules.find((mod) => mod.module === moduleType);
  if (!moduleDef) return { variants: [], sizes: [], colors: [] };

  const compat = normalizeCompatibility(moduleDef.compatibleWith);
  const allowedWalls = getAllowedWalls(config.type);
  const hasWalls = allowedWalls.length > 0;
  const ledWallSelected = hasWalls && hasLedWallSurface(config);
  const trussEnabled = Boolean(config.modules.truss || (config.modules as any).trussConfig?.enabled);

  let variants = moduleDef.variants ?? [];

  switch (moduleType) {
    case "ledFrame":
      if (ledWallSelected && (compat.ledWall?.length ?? 0) > 0) {
        variants = variants.filter((variant) => compat.ledWall!.includes(variant.key));
      }
      break;
    case "counter":
      if (config.modules.countersWithPower && (compat.powerAddon?.length ?? 0) > 0) {
        variants = variants.filter((variant) => compat.powerAddon!.includes(variant.key));
      }
      break;
    case "screen": {
      const allowedKeys = new Set<string>();
      if (hasWalls) (compat.ledWall ?? []).forEach((key) => allowedKeys.add(key));
      if (trussEnabled) (compat.truss ?? []).forEach((key) => allowedKeys.add(key));
      (compat.floorStands ?? []).forEach((key) => allowedKeys.add(key));

      if (allowedKeys.size > 0) {
        variants = variants.filter((variant) => allowedKeys.has(variant.key));
      } else {
        variants = variants.filter((variant) => {
          if (variant.mount === "wall") return hasWalls;
          if (variant.mount === "truss") return trussEnabled;
          return true;
        });
      }
      break;
    }
    case "truss":
      variants = variants.filter((variant) => {
        const dims = variant.dimensions;
        const fitsWidth = typeof dims?.width !== "number" || dims.width <= config.width;
        const fitsDepth = typeof dims?.depth !== "number" || dims.depth <= config.depth;
        return fitsWidth && fitsDepth;
      });
      break;
  }

  return {
    variants,
    sizes: collectUniqueNumbers(
      variants.flatMap((variant) => (Array.isArray(variant.sizes) ? variant.sizes : []))
    ),
    colors: collectUniqueStrings(
      variants.flatMap((variant) => (Array.isArray(variant.colors) ? variant.colors : []))
    ),
  };
}
