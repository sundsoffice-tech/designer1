import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_PRICING_MODEL,
  mergePricingModel,
  resolveCustomerMultiplier,
} from "./pricingDefaults.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_FILE = path.join(__dirname, "data", "pricing.json");
const CACHE_MS =
  Math.max(1, Number(process.env.PRICING_CACHE_MINUTES) || 5) * 60 * 1000;

const cache = {
  model: null,
  fetchedAt: 0,
  source: "default",
};

const readLocalModel = async () => {
  const file = process.env.PRICING_DATA_FILE || DEFAULT_DATA_FILE;
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return { model: parsed, source: `file:${file}` };
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("[pricing] Failed to read local pricing file", err);
    }
    return null;
  }
};

const fetchRemoteModel = async () => {
  const url = process.env.PRICING_API_URL;
  if (!url) return null;
  try {
    const headers = {};
    if (process.env.PRICING_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.PRICING_API_TOKEN}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Pricing API ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    return { model: json, source: `api:${url}` };
  } catch (err) {
    console.warn("[pricing] Failed to fetch pricing from API", err);
    return null;
  }
};

const loadFreshPricing = async () => {
  const remote = await fetchRemoteModel();
  if (remote) return remote;
  const local = await readLocalModel();
  if (local) return local;
  return { model: DEFAULT_PRICING_MODEL, source: "default" };
};

const ensureCachedModel = async (forceRefresh = false) => {
  const stale = Date.now() - cache.fetchedAt > CACHE_MS;
  if (!forceRefresh && cache.model && !stale) return cache;

  const loaded = await loadFreshPricing();
  cache.model = mergePricingModel(loaded.model);
  cache.fetchedAt = Date.now();
  cache.source = loaded.source;
  return cache;
};

export const loadPricingModel = async ({ customerId, forceRefresh, customerMultiplier } = {}) => {
  const cached = await ensureCachedModel(forceRefresh);
  const customer = resolveCustomerMultiplier(cached.model, customerId, customerMultiplier);
  return {
    model: cached.model,
    source: cached.source,
    fetchedAt: cached.fetchedAt,
    customer,
  };
};

export const loadModuleCatalog = async (options = {}) => {
  const { model, source, fetchedAt, customer } = await loadPricingModel(options);
  return {
    modules: model.modules || {},
    source,
    fetchedAt,
    customer,
  };
};
