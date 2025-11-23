const defaultBase = "http://localhost:4000";

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || defaultBase).replace(/\/$/, "");
