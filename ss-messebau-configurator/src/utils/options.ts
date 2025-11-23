import type { StandConfig } from "../lib/pricing";
import type { ModuleCatalog, ModuleKind, ResolvedModuleVariant } from "../types/modules";

type AllowedOptions = {
  variants: ResolvedModuleVariant[];
  sizes?: number[];
  colors?: string[];
};

const emptyResult: AllowedOptions = {
  variants: [],
  sizes: [],
  colors: [],
};

const hasLedWall = (config?: StandConfig): boolean => {
  if (!config?.modules?.wallsDetail) return false;
  return Object.values(config.modules.wallsDetail).some((wall) => wall?.surface === "led");
};

/**
 * Filters module options based on the current configuration and compatibility rules
 * defined in the module catalog. Currently used for LED frames and counters.
 */
export function getAllowedOptions(
  catalog: ModuleCatalog | null | undefined,
  config: StandConfig | null | undefined,
  moduleKey: string
): AllowedOptions {
  if (!catalog) return emptyResult;

  const moduleDef = catalog.modules.find((mod) => mod.module === moduleKey);
  if (!moduleDef) return emptyResult;

  const variants: ResolvedModuleVariant[] = moduleDef.variants.map((variant) => ({
    ...variant,
    module: moduleDef.module,
    moduleLabel: moduleDef.label,
    kind: moduleDef.kind as ModuleKind,
  }));

  const compat = moduleDef.compatibleWith ?? {};
  let filtered = variants;

  if (moduleKey === "ledFrame" && hasLedWall(config ?? undefined)) {
    const allowed = compat.ledWall ?? [];
    if (Array.isArray(allowed) && allowed.length > 0) {
      filtered = variants.filter((variant) => allowed.includes(variant.key));
    }
  }

  if (moduleKey === "counter" && config?.modules?.countersWithPower) {
    const allowed = compat.powerAddon ?? [];
    if (Array.isArray(allowed) && allowed.length > 0) {
      filtered = variants.filter((variant) => allowed.includes(variant.key));
    }
  }

  const sizes = filtered.flatMap((variant) => variant.sizes ?? []);
  const colors = filtered.flatMap((variant) => variant.colors ?? []);

  return {
    variants: filtered,
    sizes,
    colors,
  };
}
