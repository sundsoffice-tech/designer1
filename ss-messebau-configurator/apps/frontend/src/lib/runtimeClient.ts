import { fetchApi, runtimeApiDisabled } from "./apiBase";
import { calcPrice } from "./pricing";
import type { StandConfig } from "./pricing";

type PriceRequestOptions = {
  customerId?: string;
};

export type ValidationIssue = {
  code: string;
  message: string;
  refs?: string[];
};

const toErrorMessage = async (res: Response) => {
  try {
    const data = await res.json();
    if (typeof data?.error === "string") return data.error;
  } catch {
    // ignore parse errors and fall back to status text
  }
  return res.statusText || "Request failed";
};

const resolveCustomerId = (options?: PriceRequestOptions) => {
  const envCustomerId = import.meta.env.VITE_CUSTOMER_ID;
  return options?.customerId || (envCustomerId ? String(envCustomerId) : undefined);
};

const isRuntimeDisabled = runtimeApiDisabled;

const LOCAL_CONFIG_KEY = "ss-runtime-configs";

type LocalConfigEntry = { config: StandConfig; createdAt: number };

const readLocalConfigs = (): Record<string, LocalConfigEntry> => {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalConfigEntry>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore parse errors and reset below
  }
  return {};
};

const writeLocalConfigs = (value: Record<string, LocalConfigEntry>) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

export async function fetchRuntimePrice(
  config: StandConfig,
  options?: PriceRequestOptions
): Promise<number> {
  if (isRuntimeDisabled) {
    const customerId = resolveCustomerId(options);
    return calcPrice(config, undefined, { customerId });
  }

  const customerId = resolveCustomerId(options);
  const payload: Record<string, unknown> = { config };
  if (customerId) payload.customerId = customerId;

  let res: Response;
  try {
    res = await fetchApi("/api/runtime/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preis-API nicht erreichbar";
    throw new Error(message);
  }

  if (!res.ok) {
    const msg = await toErrorMessage(res);
    throw new Error(msg);
  }

  const data = await res.json();
  if (typeof data?.price !== "number" || Number.isNaN(data.price)) {
    throw new Error("Invalid price payload");
  }
  return data.price;
}

export async function validateRuntimeConfig(
  config: StandConfig
): Promise<{ ok: boolean; issues: ValidationIssue[] }> {
  if (isRuntimeDisabled) {
    return { ok: true, issues: [] };
  }

  let res: Response;
  try {
    res = await fetchApi("/api/runtime/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plausibilitaets-API nicht erreichbar";
    throw new Error(message);
  }

  if (!res.ok) {
    const msg = await toErrorMessage(res);
    throw new Error(msg);
  }

  const data = await res.json();
  const issues = Array.isArray(data?.issues)
    ? data.issues.filter((i: unknown): i is ValidationIssue => {
        const item = i as { message?: unknown; code?: unknown; refs?: unknown };
        return typeof item?.message === "string";
      })
    : [];

  return {
    ok: Boolean(data?.ok ?? issues.length === 0),
    issues,
  };
}

export async function saveRuntimeConfig(
  config: StandConfig
): Promise<{ id: string; expiresAt?: number }> {
  if (isRuntimeDisabled) {
    const existing = readLocalConfigs();
    const id = `local-${Date.now().toString(36)}`;
    existing[id] = { config, createdAt: Date.now() };
    writeLocalConfigs(existing);
    return { id };
  }

  let res: Response;
  try {
    res = await fetchApi("/api/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Speichern fehlgeschlagen (Backend nicht erreichbar)";
    throw new Error(message);
  }

  if (!res.ok) {
    const msg = await toErrorMessage(res);
    throw new Error(msg);
  }

  const data = await res.json();
  if (typeof data?.id !== "string" || data.id.length === 0) {
    throw new Error("Invalid config response");
  }
  return { id: data.id, expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : undefined };
}

export async function loadRuntimeConfig(id: string): Promise<StandConfig> {
  if (isRuntimeDisabled) {
    const configs = readLocalConfigs();
    const entry = configs[id];
    if (!entry) {
      throw new Error("Lokale Konfiguration nicht gefunden (Runtime-Backend ist deaktiviert)");
    }
    return entry.config;
  }

  let res: Response;
  try {
    res = await fetchApi(`/api/configs/${encodeURIComponent(id)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Konfiguration konnte nicht geladen werden.";
    throw new Error(message);
  }

  if (!res.ok) {
    const msg = await toErrorMessage(res);
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data?.config) {
    throw new Error("Config not found");
  }
  return data.config as StandConfig;
}
