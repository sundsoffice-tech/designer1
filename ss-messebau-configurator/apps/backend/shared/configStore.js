import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { safeNumber } from "@ss/shared";

const DEFAULT_DATA_DIR = join(process.cwd(), "data");
const DEFAULT_FILE_NAME = "configs.json";

const isValidRecord = (item) =>
  item &&
  typeof item.id === "string" &&
  item.id.length > 0 &&
  item.config &&
  typeof item.config === "object" &&
  !Array.isArray(item.config);

export class PersistentConfigStore {
  constructor({ ttlMs, maxEntries, dataDir = DEFAULT_DATA_DIR, fileName = DEFAULT_FILE_NAME }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.dataDir = dataDir;
    this.filePath = join(dataDir, fileName);
    this.records = new Map();

    this.pendingPersist = null;
    this.isPersisting = false;
    this.needsPersist = false;
  }

  static async create(options) {
    const store = new PersistentConfigStore(options);
    await store.loadFromDisk();
    store.purgeExpired();
    return store;
  }

  async loadFromDisk() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      const now = Date.now();

      for (const item of items) {
        if (!isValidRecord(item)) continue;
        const createdAt = Number(item.createdAt) || now;
        const expiresAt = Number(item.expiresAt) || createdAt + this.ttlMs;
        if (expiresAt <= now) continue;
        this.records.set(item.id, { ...item, createdAt, expiresAt });
      }
    } catch (err) {
      if (err?.code !== "ENOENT") {
        console.warn("Failed to load config store, starting empty", err);
      }
    }
  }

  purgeExpired() {
    const now = Date.now();
    let purged = 0;
    for (const [id, entry] of this.records.entries()) {
      if (!entry.expiresAt || entry.expiresAt <= now) {
        this.records.delete(id);
        purged += 1;
      }
    }
    if (purged > 0) {
      this.persistSoon();
    }
    return purged;
  }

  enforceLimit() {
    if (!this.maxEntries || this.records.size <= this.maxEntries) return;
    const ordered = [...this.records.values()].sort((a, b) => {
      if (a.expiresAt !== b.expiresAt) return a.expiresAt - b.expiresAt;
      return a.createdAt - b.createdAt;
    });
    while (this.records.size > this.maxEntries && ordered.length) {
      const eldest = ordered.shift();
      if (eldest) {
        this.records.delete(eldest.id);
      }
    }
    this.persistSoon();
  }

  persistSoon() {
    if (this.pendingPersist) return;
    this.pendingPersist = setTimeout(() => {
      this.pendingPersist = null;
      void this.flushToDisk();
    }, 50);
  }

  async flushToDisk() {
    if (this.isPersisting) {
      this.needsPersist = true;
      return;
    }

    this.isPersisting = true;
    try {
      await mkdir(this.dataDir, { recursive: true });
      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        items: [...this.records.values()],
      };
      const tmpPath = `${this.filePath}.tmp`;
      await writeFile(tmpPath, JSON.stringify(payload));
      await rename(tmpPath, this.filePath);
    } catch (err) {
      console.error("Failed to persist configs", err);
    } finally {
      this.isPersisting = false;
      if (this.needsPersist) {
        this.needsPersist = false;
        await this.flushToDisk();
      }
    }
  }

  save(config) {
    const now = Date.now();
    const id = randomUUID();
    const entry = {
      id,
      config,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.records.set(id, entry);
    this.enforceLimit();
    this.persistSoon();
    return { id, expiresAt: entry.expiresAt };
  }

  get(id) {
    const entry = this.records.get(id);
    if (!entry) return null;
    if (!entry.expiresAt || entry.expiresAt <= Date.now()) {
      this.records.delete(id);
      this.persistSoon();
      return null;
    }
    return { config: entry.config, expiresAt: entry.expiresAt };
  }
}
