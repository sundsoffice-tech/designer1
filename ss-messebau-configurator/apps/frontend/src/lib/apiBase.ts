const DEFAULT_BASE = import.meta.env.DEV ? "http://localhost:4000" : "";
const envBase = (import.meta.env.VITE_API_BASE_URL || "").trim();

const runtimeFlag = String(import.meta.env.VITE_DISABLE_RUNTIME ?? "").toLowerCase();
const runtimeExplicitlyDisabled = runtimeFlag === "true";
const runtimeExplicitlyEnabled = runtimeFlag === "false";
const hasConfiguredBase = envBase.length > 0;
const hasDefaultBase = DEFAULT_BASE.length > 0;

export const runtimeApiDisabled =
  runtimeExplicitlyDisabled || (!runtimeExplicitlyEnabled && !hasConfiguredBase && !hasDefaultBase);
export const runtimeApiEnabled = !runtimeApiDisabled;

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);
const normalizeBase = () => {
  if (runtimeApiDisabled) return "";
  if (envBase) {
    if (isAbsoluteUrl(envBase)) return envBase;

    const normalized = envBase.startsWith("/") ? envBase : `/${envBase}`;
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${normalized}`;
    }
    return `${DEFAULT_BASE}${normalized}`;
  }

  if (DEFAULT_BASE) return DEFAULT_BASE;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
};

export const apiBaseUrl = normalizeBase().replace(/\/$/, "");

export const buildApiUrl = (path: string) => {
  if (!path) return apiBaseUrl;
  if (isAbsoluteUrl(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!apiBaseUrl) return normalizedPath;
  return `${apiBaseUrl}${normalizedPath}`;
};

export const fetchApi = async (path: string, init?: RequestInit) => {
  if (runtimeApiDisabled || !apiBaseUrl) {
    throw new Error(
      "Backend deaktiviert oder nicht konfiguriert (VITE_DISABLE_RUNTIME=true oder fehlendes VITE_API_BASE_URL)."
    );
  }

  try {
    return await fetch(buildApiUrl(path), init);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const target = apiBaseUrl || "kein API-Host gesetzt";
    throw new Error(
      `Backend nicht erreichbar (${target}). Bitte Server starten oder VITE_API_BASE_URL setzen. (${reason})`
    );
  }
};
