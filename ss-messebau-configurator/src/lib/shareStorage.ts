import type { StandConfig } from "./pricing";

const STORAGE_KEY = "ss-configurator.share-snapshots";
const MAX_ENTRIES = 12;

type StoredShare = {
  id: string;
  config: StandConfig;
  savedAt: number;
};

const hasStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readShares = (): StoredShare[] => {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: typeof item?.id === "string" ? item.id : "",
        savedAt: typeof item?.savedAt === "number" ? item.savedAt : Date.now(),
        config: item?.config as StandConfig,
      }))
      .filter((item) => item.id.length > 0 && item.config);
  } catch {
    return [];
  }
};

const writeShares = (entries: StoredShare[]) => {
  if (!hasStorage()) return;
  const trimmed = entries.slice(0, MAX_ENTRIES);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
};

const generateLocalId = () => {
  const core =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `cfg-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return `local-${core}`;
};

export const rememberShareLocally = (config: StandConfig, preferredId?: string) => {
  const savedAt = Date.now();
  const id = preferredId && preferredId.length ? preferredId : generateLocalId();
  const entries = readShares().filter((entry) => entry.id !== id);
  entries.unshift({ id, config, savedAt });
  writeShares(entries);
  return { id, savedAt };
};

export const loadLocalShare = (id: string): StandConfig | null => {
  if (!id) return null;
  const found = readShares().find((entry) => entry.id === id);
  return found?.config ?? null;
};

export const isLocalShareId = (id?: string | null) => Boolean(id && id.startsWith("local-"));
