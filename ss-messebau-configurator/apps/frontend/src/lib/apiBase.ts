const DEFAULT_BASE = "http://localhost:4000";
const envBase = (import.meta.env.VITE_API_BASE_URL || "").trim();

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);
const normalizeBase = () => {
  if (!envBase) return DEFAULT_BASE;
  if (isAbsoluteUrl(envBase)) return envBase;

  const normalized = envBase.startsWith("/") ? envBase : `/${envBase}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${normalized}`;
  }
  return `${DEFAULT_BASE}${normalized}`;
};

export const apiBaseUrl = normalizeBase().replace(/\/$/, "");

export const buildApiUrl = (path: string) => {
  if (!path) return apiBaseUrl;
  if (isAbsoluteUrl(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
};

export const fetchApi = async (path: string, init?: RequestInit) => {
  try {
    return await fetch(buildApiUrl(path), init);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Backend nicht erreichbar (${apiBaseUrl}). Bitte Server starten oder VITE_API_BASE_URL setzen. (${reason})`
    );
  }
};
