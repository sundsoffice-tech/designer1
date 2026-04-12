import { z } from "zod";
import type {
  ModuleCatalog,
  ModuleVariantMap,
  ModuleCompatibilityIndex,
  ModuleKind,
  ModuleBundle,
} from "@ss/shared";
import { buildApiUrl, runtimeApiDisabled } from "../lib/apiBase";
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
  clearance: z.number().optional(),
  tags: z.array(z.string()).optional(),
  dimensions: dimensionsSchema.optional(),
  screenSize: z.string().optional(),
  mount: z.enum(["wall", "truss", "floor"]).optional(),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]))
    .optional(),
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
const DEFAULT_ENDPOINT = "/api/catalog/modules";
const EXPLICIT_ENDPOINT = (import.meta.env.VITE_MODULE_CATALOG_URL || "").trim();
const LOCAL_FALLBACK = (import.meta.env.VITE_MODULE_CATALOG_FILE || "/config/modules.json").trim();

const uniqueSources = (sources: string[]) => Array.from(new Set(sources.filter(Boolean)));

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);
const resolveUrl = (value: string) => {
  if (!value) return value;
  if (isAbsoluteUrl(value)) return value;
  if (!runtimeApiDisabled) {
    return buildApiUrl(value);
  }
  return value.startsWith("/") ? value : `/${value}`;
};

type LoadResult = {
  catalog: ModuleCatalog;
  variants: ModuleVariantMap;
  compatibility: ModuleCompatibilityIndex;
  bundles: ModuleBundle[];
  source?: string;
};

/** Parsed and validated module catalog (JSON source of truth). */
export let moduleCatalog: ModuleCatalog = localCatalog;
export let moduleVariantsByKey: ModuleVariantMap = buildVariantMap(localCatalog);
export let moduleCompatibilityIndex: ModuleCompatibilityIndex = buildCompatibilityIndex(localCatalog);
export let moduleBundles: ModuleBundle[] = localCatalog.bundles ?? [];

let lastSource = "static";
let inflight: Promise<LoadResult> | null = null;

const applyCatalog = (next: ModuleCatalog, source: string) => {
  moduleCatalog = next;
  moduleVariantsByKey = buildVariantMap(next);
  moduleCompatibilityIndex = buildCompatibilityIndex(next);
  moduleBundles = next.bundles ?? [];
  lastSource = source;
};

const fetchCatalog = async (source: string): Promise<ModuleCatalog | null> => {
  if (!source) return null;
  const url = resolveUrl(source);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const payload = data?.catalog && data.catalog.modules ? data.catalog : data;
  if (!payload?.modules) return null;
  return parseCatalog(payload);
};

export const loadModuleCatalog = async (): Promise<LoadResult> => {
  if (inflight) return inflight;

  inflight = (async () => {
    const apiSource = runtimeApiDisabled ? "" : (EXPLICIT_ENDPOINT || DEFAULT_ENDPOINT);
    const sources = uniqueSources([apiSource, LOCAL_FALLBACK]);
    for (const source of sources) {
      try {
        const catalog = await fetchCatalog(source);
        if (!catalog) continue;
        applyCatalog(catalog, source);
        return {
          catalog: moduleCatalog,
          variants: moduleVariantsByKey,
          compatibility: moduleCompatibilityIndex,
          bundles: moduleBundles,
          source,
        };
      } catch {
        // try next source
      }
    }

    return {
      catalog: moduleCatalog,
      variants: moduleVariantsByKey,
      compatibility: moduleCompatibilityIndex,
      bundles: moduleBundles,
      source: lastSource,
    };
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
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
  const compat = moduleCompatibilityIndex;

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
