import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CATALOG_FILE = path.join(__dirname, "data", "modules.json");
const CACHE_MS = Math.max(1, Number(process.env.MODULE_CATALOG_CACHE_MINUTES) || 5) * 60 * 1000;

const cache = {
  catalog: null,
  fetchedAt: 0,
  source: "default",
};

const readLocalCatalog = async () => {
  const file = process.env.MODULE_CATALOG_FILE || DEFAULT_CATALOG_FILE;
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.modules || !Array.isArray(parsed.modules)) {
      throw new Error("modules[] missing in catalog file");
    }
    return { catalog: parsed, source: `file:${file}` };
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.warn("[modules] Failed to read local catalog", err);
    }
    return null;
  }
};

const fetchRemoteCatalog = async () => {
  const url = process.env.MODULE_CATALOG_URL;
  if (!url) return null;
  try {
    const headers = {};
    if (process.env.MODULE_CATALOG_TOKEN) {
      headers.Authorization = `Bearer ${process.env.MODULE_CATALOG_TOKEN}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Module catalog API ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    if (!json?.modules || !Array.isArray(json.modules)) {
      throw new Error("modules[] missing in remote payload");
    }
    return { catalog: json, source: `api:${url}` };
  } catch (err) {
    console.warn("[modules] Failed to fetch catalog from API", err?.message ?? err);
    return null;
  }
};

const ensureCachedCatalog = async (forceRefresh = false) => {
  const stale = Date.now() - cache.fetchedAt > CACHE_MS;
  if (!forceRefresh && cache.catalog && !stale) return cache;

  const remote = await fetchRemoteCatalog();
  if (remote) {
    cache.catalog = remote.catalog;
    cache.source = remote.source;
    cache.fetchedAt = Date.now();
    return cache;
  }

  const local = await readLocalCatalog();
  if (local) {
    cache.catalog = local.catalog;
    cache.source = local.source;
    cache.fetchedAt = Date.now();
    return cache;
  }

  cache.catalog = { modules: [], bundles: [] };
  cache.source = "default";
  cache.fetchedAt = Date.now();
  return cache;
};

export const loadModuleCatalog = async ({ forceRefresh } = {}) => {
  const cached = await ensureCachedCatalog(forceRefresh);
  return {
    catalog: cached.catalog,
    source: cached.source,
    fetchedAt: cached.fetchedAt,
  };
};

export const mergeCustomModulesIntoCatalog = (catalog, models = []) => {
  const baseModules = Array.isArray(catalog?.modules) ? [...catalog.modules] : [];
  const bundles = Array.isArray(catalog?.bundles) ? catalog.bundles : [];

  if (!Array.isArray(models) || models.length === 0) {
    return { modules: baseModules, bundles };
  }

  const customVariants = [];
  const lampVariants = [];
  const seen = new Set();

  models.forEach((mod) => {
    if (!mod?.id || seen.has(mod.id)) return;
    seen.add(mod.id);
    const variant = {
      key: mod.id,
      name: mod.name || mod.id,
      variant: mod.category || undefined,
      dimensions: {
        width: mod.width,
        depth: mod.depth,
        height: mod.height,
      },
      clearance: mod.clearance,
      basePrice: mod.price,
      mount: mod.mount,
      tags: ["custom", mod.type || "model"].filter(Boolean),
      metadata: {
        category: mod.category,
        weight: mod.weight,
        sourceFileName: mod.sourceFileName,
        uploadedAt: mod.createdAt,
      },
    };

    if (mod.type === "lamp") {
      lampVariants.push(variant);
    } else {
      customVariants.push(variant);
    }
  });

  if (customVariants.length > 0) {
    baseModules.push({
      module: "customModels",
      label: "Custom Uploads",
      kind: "custom",
      description: "Vom Nutzer hochgeladene 3D-Objekte",
      variants: customVariants,
      notes: "Automatisch aus dem Upload-Katalog erzeugt",
    });
  }

  if (lampVariants.length > 0) {
    baseModules.push({
      module: "customLamps",
      label: "Lampen (Uploads)",
      kind: "lamp",
      description: "Hochgeladene Spot- / Fluter-Modelle",
      variants: lampVariants,
      notes: "Automatisch aus dem Upload-Katalog erzeugt",
    });
  }

  return { modules: baseModules, bundles };
};
