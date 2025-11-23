import { z } from "zod";
import type {
  ModuleCatalog,
  ModuleVariantMap,
  ModuleCompatibilityIndex,
  ModuleKind,
  ModuleBundle,
} from "../types/modules";
import { apiBaseUrl } from "../lib/apiBase";
import modulesJson from "../data/modules.json";

const colliderSchema = z.union([z.literal("aabb"), z.literal("obb"), z.literal("mesh")]);
const dimensionsSchema = z.object({
  width: z.number().optional(),
  depth: z.number().optional(),
  height: z.number().optional(),
  thickness: z.number().optional(),
});

const compatValueSchema = z.union([z.string(), z.array(z.string())]);
const compatibilitySchema = z.record(z.string(), compatValueSchema);

const variantSchema = z.object({
  key: z.string(),
  name: z.string(),
  variant: z.string().optional(),
  sizes: z.array(z.number()).optional(),
  colors: z.array(z.string()).optional(),
  basePrice: z.number().optional(),
  collider: colliderSchema.optional(),
  defaultColor: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dimensions: dimensionsSchema.optional(),
  screenSize: z.string().optional(),
  mount: z.enum(["wall", "truss", "floor"]).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const bundleItemSchema = z.object({
  variantKey: z.string(),
  quantity: z.number().optional(),
  notes: z.string().optional(),
});

const bundleSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().optional(),
  items: z.array(bundleItemSchema),
  discountPercent: z.number().optional(),
});

const moduleSchema = z.object({
  module: z.string(),
  label: z.string().optional(),
  kind: z.string(),
  description: z.string().optional(),
  variants: z.array(variantSchema),
  compatibleWith: compatibilitySchema.optional(),
  notes: z.string().optional(),
});

const catalogSchema = z.object({
  modules: z.array(moduleSchema),
  bundles: z.array(bundleSchema).optional(),
});

const parseCatalog = (input: unknown): ModuleCatalog => catalogSchema.parse(input) as ModuleCatalog;

const buildVariantMap = (catalog: ModuleCatalog): ModuleVariantMap =>
  catalog.modules.reduce<ModuleVariantMap>((acc, mod) => {
    mod.variants.forEach((variant) => {
      acc[variant.key] = {
        ...variant,
        module: mod.module,
        moduleLabel: mod.label,
        kind: mod.kind as ModuleKind,
      };
    });
    return acc;
  }, {});

const buildCompatibilityIndex = (catalog: ModuleCatalog): ModuleCompatibilityIndex => {
  const index: ModuleCompatibilityIndex = {};
  catalog.modules.forEach((mod) => {
    if (mod.compatibleWith) {
      const normalized: Record<string, string[]> = {};
      Object.entries(mod.compatibleWith).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          normalized[k] = v;
        } else if (typeof v === "string") {
          normalized[k] = [v];
        }
      });
      index[mod.module] = normalized;
    }
  });
  return index;
};

const localCatalog = parseCatalog(modulesJson);

/** Parsed and validated module catalog (JSON source of truth). */
export const moduleCatalog: ModuleCatalog = localCatalog;
export const moduleVariantsByKey: ModuleVariantMap = buildVariantMap(localCatalog);
export const moduleCompatibilityIndex: ModuleCompatibilityIndex = buildCompatibilityIndex(localCatalog);
export const moduleBundles: ModuleBundle[] = localCatalog.bundles ?? [];

let cachedRemote: ModuleCatalog | null = null;
let cachedRemoteVariants: ModuleVariantMap | null = null;
let cachedRemoteCompatibility: ModuleCompatibilityIndex | null = null;

const fetchRemoteCatalog = async (): Promise<ModuleCatalog | null> => {
  try {
    const res = await fetch(`${apiBaseUrl}/api/catalog/modules`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.modules) return null;
    return parseCatalog(data);
  } catch {
    return null;
  }
};

export const loadModuleCatalog = async (): Promise<{
  catalog: ModuleCatalog;
  variants: ModuleVariantMap;
  compatibility: ModuleCompatibilityIndex;
  bundles: ModuleBundle[];
}> => {
  if (cachedRemote) {
    const variants = cachedRemoteVariants ?? buildVariantMap(cachedRemote);
    const compatibility = cachedRemoteCompatibility ?? buildCompatibilityIndex(cachedRemote);
    cachedRemoteVariants = variants;
    cachedRemoteCompatibility = compatibility;
    return {
      catalog: cachedRemote,
      variants,
      compatibility,
      bundles: cachedRemote.bundles ?? [],
    };
  }

  const remote = await fetchRemoteCatalog();
  if (remote) {
    cachedRemote = remote;
    cachedRemoteVariants = buildVariantMap(remote);
    cachedRemoteCompatibility = buildCompatibilityIndex(remote);
    return {
      catalog: remote,
      variants: cachedRemoteVariants,
      compatibility: cachedRemoteCompatibility,
      bundles: remote.bundles ?? [],
    };
  }

  return {
    catalog: moduleCatalog,
    variants: moduleVariantsByKey,
    compatibility: moduleCompatibilityIndex,
    bundles: moduleBundles,
  };
};

export type ModuleSelection = {
  frames?: string[];
  screens?: { key: string; mount?: string }[];
  counters?: { key: string; withPower?: boolean }[];
  features?: string[]; // e.g. ["ledWall", "truss"]
};

/** Prüft Modul-Kombinationen anhand der Kompatibilitätsregeln in modules.json. */
export const isCombinationAllowed = (selection: ModuleSelection): { ok: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  const compat = cachedRemoteCompatibility ?? moduleCompatibilityIndex;

  // LED-Wand erfordert spezifischen Rahmen
  if (selection.features?.includes("ledWall")) {
    const allowedFrames = compat.ledFrame?.ledWall ?? [];
    const anyFrameOk = (selection.frames ?? []).some((f) => allowedFrames.includes(f));
    if (!anyFrameOk) {
      reasons.push("LED-Wand ist nur mit einem Octalumina-Rahmen erlaubt.");
    }
  }

  // Screens je nach Mount prüfen
  const screenCompat = compat.screen ?? {};
  const trussAllowed = screenCompat.truss ?? [];
  const wallAllowed = screenCompat.ledWall ?? [];
  const floorAllowed = screenCompat.floorStands ?? [];

  (selection.screens ?? []).forEach((s) => {
    const key = s.key;
    const mount = s.mount ?? "wall";
    if (mount === "truss" && trussAllowed.length && !trussAllowed.includes(key)) {
      reasons.push("Ausgewählter Screen ist nicht truss-kompatibel.");
    }
    if (mount === "floor" && floorAllowed.length && !floorAllowed.includes(key)) {
      reasons.push("Ausgewählter Screen ist nicht für Bodenständer freigegeben.");
    }
    if (mount === "wall" && wallAllowed.length && !wallAllowed.includes(key)) {
      reasons.push("Ausgewählter Screen ist nicht LED-Wand-kompatibel.");
    }
  });

  // Counter mit Strompaket prüfen
  if (selection.counters?.some((c) => c.withPower)) {
    const allowed = compat.counter?.powerAddon ?? [];
    const anyOk = selection.counters.some((c) => c.withPower && allowed.includes(c.key));
    if (!anyOk && allowed.length > 0) {
      reasons.push("Strompaket ist für den gewählten Tresen nicht zulässig.");
    }
  }

  return { ok: reasons.length === 0, reasons };
};
