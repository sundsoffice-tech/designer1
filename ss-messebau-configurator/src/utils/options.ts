import type { StandConfig } from "../lib/pricing";
import type { ModuleCatalog, ModuleKind, ResolvedModuleVariant } from "../types/modules";

type AllowedOptions = {
  variants: ResolvedModuleVariant[];
  sizes: number[];
  colors: string[];
};

const createEmptyResult = (): AllowedOptions => ({
  variants: [],
  sizes: [],
  colors: [],
});

const hasLedWall = (config?: StandConfig): boolean => {
  if (!config?.modules?.wallsDetail) return false;
  return Object.values(config.modules.wallsDetail).some((wall) => wall?.surface === "led");
};

const compatibilityGuards: Record<string, (config?: StandConfig) => string | null> = {
  ledFrame: (cfg) => (hasLedWall(cfg) ? "ledWall" : null),
  counter: (cfg) => (cfg?.modules?.countersWithPower ? "powerAddon" : null),
};

const restrictVariants = (
  variants: ResolvedModuleVariant[],
  allowed?: string[]
): ResolvedModuleVariant[] => {
  if (!allowed || allowed.length === 0) return variants;
  return variants.filter((variant) => allowed.includes(variant.key));
};

const collectUniqueOptions = <T>(
  variants: ResolvedModuleVariant[],
  picker: (variant: ResolvedModuleVariant) => T[] | undefined
): T[] => {
  const merged = variants.flatMap((variant) => picker(variant) ?? []);
  return merged.length ? Array.from(new Set(merged)) : [];
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
  if (!catalog) return createEmptyResult();

  const moduleDef = catalog.modules.find((mod) => mod.module === moduleKey);
  if (!moduleDef) return createEmptyResult();

  const variants: ResolvedModuleVariant[] = moduleDef.variants.map((variant) => ({
    ...variant,
    module: moduleDef.module,
    moduleLabel: moduleDef.label,
    kind: moduleDef.kind as ModuleKind,
  }));

  const compatKey = compatibilityGuards[moduleKey]?.(config ?? undefined);
  const allowedKeys = compatKey ? moduleDef.compatibleWith?.[compatKey] : undefined;
  const filtered = restrictVariants(variants, Array.isArray(allowedKeys) ? allowedKeys : undefined);

  return {
    variants: filtered,
    sizes: collectUniqueOptions(filtered, (variant) => variant.sizes),
    colors: collectUniqueOptions(filtered, (variant) => variant.colors),
  };
}
