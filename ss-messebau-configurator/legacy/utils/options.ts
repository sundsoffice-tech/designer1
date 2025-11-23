import type { ResolvedModuleVariant } from "../../src/types/modules";

/**
 * Legacy helpers for collecting option metadata (sizes, colors) across variants.
 * These are kept for reference; current UI only needs the filtered variant list.
 */
export const collectUniqueOptions = <T>(
  variants: ResolvedModuleVariant[],
  picker: (variant: ResolvedModuleVariant) => T[] | undefined
): T[] => {
  const merged = variants.flatMap((variant) => picker(variant) ?? []);
  return merged.length ? Array.from(new Set(merged)) : [];
};

export const summarizeVariantOptions = (variants: ResolvedModuleVariant[]): {
  sizes: number[];
  colors: string[];
} => ({
  sizes: collectUniqueOptions(variants, (variant) => variant.sizes),
  colors: collectUniqueOptions(variants, (variant) => variant.colors),
});
