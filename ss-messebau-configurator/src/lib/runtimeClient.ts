import { apiBaseUrl } from "./apiBase";
import type { StandConfig } from "./pricing";

export type PriceRequestOptions = {
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

  const res = await fetch(`${apiBaseUrl}/api/runtime/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

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
  const res = await fetch(`${apiBaseUrl}/api/runtime/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });

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
  const res = await fetch(`${apiBaseUrl}/api/configs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });

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
  const res = await fetch(`${apiBaseUrl}/api/configs/${encodeURIComponent(id)}`);

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
