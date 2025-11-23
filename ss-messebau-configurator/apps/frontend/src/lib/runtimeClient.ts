import { fetchApi } from "./apiBase";
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

export async function fetchRuntimePrice(
  config: StandConfig,
  options?: PriceRequestOptions
): Promise<number> {
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
