import type { CommandId } from "../store/commandTypes";

type UsageKey = `${CommandId}:${string | "any"}`;

type UsageEntry = {
  key: UsageKey;
  count: number;
  lastUsed: number;
};

type UsagePayload = {
  commandId: CommandId;
  objectType?: string;
  selectionCount?: number;
  role?: string;
};

const STORAGE_KEY = "contextMenuUsage";

const loadUsage = (): Record<UsageKey, UsageEntry> => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<UsageKey, UsageEntry>;
  } catch {
    return {};
  }
};

const persistUsage = (data: Record<UsageKey, UsageEntry>) => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be unavailable; fail silently
  }
};

const usageCache: Record<UsageKey, UsageEntry> = loadUsage();

export const recordCommandUsage = (payload: UsagePayload) => {
  const objectType = payload.objectType ?? "any";
  const key: UsageKey = `${payload.commandId}:${objectType}`;
  const next = { key, count: (usageCache[key]?.count ?? 0) + 1, lastUsed: Date.now() };
  usageCache[key] = next;
  persistUsage(usageCache);
};

export const getFrequentCommands = (objectType: string | undefined, limit = 4): CommandId[] => {
  const entries = Object.values(usageCache).filter((entry) => entry.key.endsWith(`:${objectType ?? "any"}`));
  const anyEntries = Object.values(usageCache).filter((entry) => entry.key.endsWith(":any"));
  const combined = [...entries, ...anyEntries];
  combined.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  return combined.slice(0, limit).map((entry) => entry.key.split(":")[0] as CommandId);
};
