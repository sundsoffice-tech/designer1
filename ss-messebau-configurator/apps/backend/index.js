import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { spawn } from "child_process";
import sharp from "sharp";
import { OpenAI } from "openai";
import { z } from "zod";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { aiRouter } from "./src/ai/router.js";
import { buildSceneAabbs, DEFAULT_CLEARANCE, intersects } from "./shared/collision.js";
import { PersistentConfigStore, safeNumber } from "./shared/configStore.js";
import { calcPrice } from "./shared/pricing.js";
import { loadPricingModel } from "./shared/pricingData.js";
import { loadModuleCatalog as loadModuleCatalogFromFile, mergeCustomModulesIntoCatalog } from "./shared/moduleCatalog.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Prefer the monorepo root .env, but fall back to a local one if present.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();

const corsOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});
const modelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 },
});
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});
const uploadDir = path.resolve(process.cwd(), "uploads");
const publicUploadsDir = path.resolve(process.cwd(), "public", "uploads");
const modelsDir = path.join(publicUploadsDir, "models");
const modelsCatalogPath = path.join(modelsDir, "catalog.json");
const texturesDir = path.join(publicUploadsDir, "textures");
const texturesCatalogPath = path.join(texturesDir, "catalog.json");
const videosDir = path.join(publicUploadsDir, "videos");
const configDir = path.resolve(__dirname, "shared", "data");
const sharedTextureLibraryPath = path.resolve(__dirname, "..", "..", "packages", "shared", "src", "textures.ts");
await fs.promises.mkdir(uploadDir, { recursive: true });
await fs.promises.mkdir(modelsDir, { recursive: true });
await fs.promises.mkdir(texturesDir, { recursive: true });
await fs.promises.mkdir(videosDir, { recursive: true });

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const clampDimensions = (meta, maxEdge) => {
  const width = clampNumber(meta.width ?? maxEdge, 1, maxEdge);
  const height = clampNumber(meta.height ?? maxEdge, 1, maxEdge);
  const longest = Math.max(width, height, 1);
  const scale = Math.min(1, maxEdge / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const nearestPowerOfTwoFloor = (value, max = 4096) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const clamped = clampNumber(value, 1, max);
  return 2 ** Math.floor(Math.log2(clamped));
};

const clampToPotBox = (w, h, maxEdge = 4096) => ({
  width: nearestPowerOfTwoFloor(w, maxEdge),
  height: nearestPowerOfTwoFloor(h, maxEdge),
});

const slugify = (value) =>
  (value || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "model";

const toArrayBuffer = (buffer) =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const parseSnapPoints = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((p) => ({
        x: Number(p.x),
        y: typeof p.y === "number" ? Number(p.y) : undefined,
        z: Number(p.z),
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((p) => ({
          x: Number(p.x),
          y: typeof p.y === "number" ? Number(p.y) : undefined,
          z: Number(p.z),
        }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
    }
  } catch {
    // plain string format handled below
  }

  return String(raw)
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[,|\s]+/).map((part) => Number(part)))
    .filter((coords) => coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]))
    .map((coords) => {
      const [xRaw, second, third] = coords;
      const x = xRaw;
      const y = Number.isFinite(third) ? second : undefined;
      const z = Number.isFinite(third) ? third : second;
      return { x, y, z };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
};

const ensureNodeImageEnv = () => {
  if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
  }
  if (typeof globalThis.Image === "undefined") {
    class ImageMock {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.crossOrigin = null;
      }

      set src(_value) {
        if (typeof setImmediate === "function") {
          setImmediate(() => this.onload?.({ target: this }));
        } else {
          setTimeout(() => this.onload?.({ target: this }), 0);
        }
      }
    }
    globalThis.Image = ImageMock;
    globalThis.HTMLImageElement = ImageMock;
  }
  if (typeof globalThis.document === "undefined") {
    globalThis.document = {
      createElement: () => new globalThis.Image(),
      createElementNS: () => new globalThis.Image(),
    };
  }
  if (typeof globalThis.createImageBitmap === "undefined") {
    globalThis.createImageBitmap = async (image) => ({
      close: () => (typeof image?.close === "function" ? image.close() : undefined),
    });
  }
};

const extractSizeFromObject = (object) => {
  if (!object) throw new Error("Model contains no scene graph");
  if (typeof object.updateMatrixWorld === "function") {
    object.updateMatrixWorld(true);
  }
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return { size, center };
};

const measureModelBuffer = async (buffer, ext) => {
  ensureNodeImageEnv();
  const normalizedExt = (ext || "").toLowerCase();
  const arrayBuffer = toArrayBuffer(buffer);

  if (normalizedExt === ".fbx") {
    const loader = new FBXLoader();
    const scene = loader.parse(arrayBuffer, "");
    return extractSizeFromObject(scene);
  }

  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(arrayBuffer, "");
  return extractSizeFromObject(gltf.scene);
};

const readModelCatalog = async () => {
  try {
    const raw = await fs.promises.readFile(modelsCatalogPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.warn("[models] Failed to read catalog", err);
    }
    return [];
  }
};

const writeModelCatalog = async (entries) => {
  await fs.promises.writeFile(modelsCatalogPath, JSON.stringify(entries, null, 2), "utf8");
};

const readTextureCatalog = async () => {
  try {
    const raw = await fs.promises.readFile(texturesCatalogPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.warn("[textures] Failed to read catalog", err);
    }
    return [];
  }
};

const writeTextureCatalog = async (entries) => {
  await fs.promises.writeFile(texturesCatalogPath, JSON.stringify(entries, null, 2), "utf8");
};

const renderTextureLibrarySource = (entries) => {
  const stringify = (value) => JSON.stringify(value ?? "");
  const header = `export type TextureCategory = "wall" | "floor" | "banner" | "generic";
export type TextureFit = "stretch" | "cover";

export type TextureEntry = {
  id: string;
  name: string;
  url: string;
  category: TextureCategory;
  fit?: TextureFit;
  width?: number;
  height?: number;
  size?: number;
  uploadedAt?: number;
  fileName?: string;
  mipmaps?: string[];
  ktx2Url?: string;
  format?: string;
};

export type TextureLibrary = TextureEntry[];
`;

  const body = entries
    .map((entry) => {
      const parts = [
        `id: ${stringify(entry.id)}`,
        `name: ${stringify(entry.name)}`,
        `url: ${stringify(entry.url)}`,
        `category: ${stringify(entry.category)}`,
      ];
      if (entry.fit) parts.push(`fit: ${stringify(entry.fit)}`);
      if (Number.isFinite(entry.width)) parts.push(`width: ${Number(entry.width)}`);
      if (Number.isFinite(entry.height)) parts.push(`height: ${Number(entry.height)}`);
      if (Number.isFinite(entry.size)) parts.push(`size: ${Number(entry.size)}`);
      if (Number.isFinite(entry.uploadedAt)) parts.push(`uploadedAt: ${Number(entry.uploadedAt)}`);
      if (entry.fileName) parts.push(`fileName: ${stringify(entry.fileName)}`);
      if (Array.isArray(entry.mipmaps) && entry.mipmaps.length) parts.push(`mipmaps: ${JSON.stringify(entry.mipmaps)}`);
      if (entry.ktx2Url) parts.push(`ktx2Url: ${stringify(entry.ktx2Url)}`);
      if (entry.format) parts.push(`format: ${stringify(entry.format)}`);
      return `  { ${parts.join(", ")} },`;
    })
    .join("\n");

  return `${header}
export const textureLibrary: TextureLibrary = [
${body}
];
`;
};

const writeSharedTextureLibrary = async (entries) => {
  try {
    const source = renderTextureLibrarySource(entries);
    await fs.promises.writeFile(sharedTextureLibraryPath, source, "utf8");
  } catch (err) {
    console.warn("[textures] Failed to sync shared texture library", err);
  }
};

const encodeKtx2 = async (inputPath, outputPath) => {
  const bin = process.env.KTX2_BIN || process.env.BASISU_BIN || "basisu";
  const args = ["-ktx2", "-uastc", "4", "-zcmp", "2", "-mipmap", "-y_flip", "-output_file", outputPath, inputPath];

  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: "ignore" });

    child.on("error", (err) => {
      console.warn(`KTX2 encoder not available (${bin})`, err?.message ?? err);
      resolve(false);
    });

    child.on("exit", (code) => resolve(code === 0));
  });
};

await writeSharedTextureLibrary(await readTextureCatalog());

app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(
  "/config",
  express.static(configDir, {
    etag: true,
    maxAge: "5m",
  })
);
app.use("/uploads/models", express.static(modelsDir));
app.use("/uploads/textures", express.static(texturesDir));
app.use("/uploads", express.static(publicUploadsDir));
app.use("/uploads", express.static(uploadDir));
app.use("/api/ai", aiRouter);

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-4.1";
const client = apiKey ? new OpenAI({ apiKey }) : null;

const standConfigSchema = z
  .object({
    width: z.number().positive(),
    depth: z.number().positive(),
    height: z.number().positive().optional(),
    type: z.string(),
    region: z.string().optional(),
    rush: z.boolean().optional(),
    // Explicit string key/value schema to avoid zod v4 bug with z.record(z.any())
    modules: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const payloadSchema = z.object({
  config: standConfigSchema,
  locale: z.string().optional(),
  instructions: z.string().max(600).optional(),
});

const aiResponseSchema = z
  .object({
    configPatch: z.record(z.string(), z.unknown()).default({}),
    rationale: z.string().default(""),
    warnings: z.array(z.string()).default([]),
  })
  .passthrough();

const runtimePayloadSchema = z.object({
  config: standConfigSchema,
  customerId: z.string().max(64).optional(),
});

const safeParseSchema = (schema, value) => {
  try {
    const parsed = schema.safeParse(value);
    if (parsed.success) return { ok: true, data: parsed.data };
    return {
      ok: false,
      message: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; "),
    };
  } catch (err) {
    console.error("Schema parsing failed", err);
    return { ok: false, message: err instanceof Error ? err.message : "Schema parsing failed" };
  }
};

const CONFIG_TTL_MS = safeNumber(process.env.CONFIG_TTL_HOURS, 8) * 60 * 60 * 1000;
const CONFIG_MAX_ENTRIES = Math.floor(safeNumber(process.env.CONFIG_STORE_MAX, 1000));
const CONFIG_PURGE_INTERVAL_MS =
  safeNumber(process.env.CONFIG_PURGE_INTERVAL_MINUTES, 5) * 60 * 1000;
const configStore = await PersistentConfigStore.create({
  ttlMs: CONFIG_TTL_MS,
  maxEntries: CONFIG_MAX_ENTRIES,
  dataDir: process.env.CONFIG_STORE_DIR || undefined,
});

const normalizeConfig = (cfg) => ({
  ...cfg,
  type: cfg.type ?? "row",
  region: cfg.region ?? "NRW",
  modules: cfg.modules ?? {},
});

const validateConfig = (cfg) => {
  const normalized = normalizeConfig(cfg);
  const issues = [];

  if (!normalized.type) {
    issues.push({ code: "type", message: "Standtyp fehlt." });
  }
  if (normalized.width <= 0 || normalized.depth <= 0) {
    issues.push({ code: "dimensions", message: "Breite/Tiefe muessen positiv sein." });
  }
  if (normalized.width * normalized.depth > 400) {
    issues.push({ code: "dimensions", message: "Standflaeche wirkt unplausibel gross." });
  }

  try {
    const clearance = normalized.modules.collisionClearance ?? DEFAULT_CLEARANCE;
    const boxes = buildSceneAabbs(normalized, clearance);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (intersects(boxes[i], boxes[j])) {
          issues.push({
            code: "collision",
            message: `${boxes[i].label} kollidiert mit ${boxes[j].label}`,
            refs: [boxes[i].id, boxes[j].id],
          });
        }
      }
    }
  } catch (err) {
    console.error("Plausibility check failed", err);
    issues.push({ code: "internal", message: "Konnte Kollisionscheck nicht ausfuehren." });
  }

  return { ok: issues.length === 0, issues, normalized };
};

setInterval(() => configStore.purgeExpired(), Math.max(CONFIG_PURGE_INTERVAL_MS, 60_000)).unref?.();

app.get("/api/runtime/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/runtime/price", async (req, res) => {
  const parsed = safeParseSchema(runtimePayloadSchema, req.body);
  if (!parsed.ok) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.message,
    });
  }

  const config = normalizeConfig(parsed.data.config);
  const bodyCustomer = parsed.data.customerId;
  const headerCustomer = typeof req.headers["x-customer-id"] === "string" ? req.headers["x-customer-id"] : undefined;
  const customerId = bodyCustomer || headerCustomer;

  try {
    const pricingCtx = await loadPricingModel({ customerId });
    const price = calcPrice(config, pricingCtx.model, {
      customerId,
      customerMultiplier: pricingCtx.customer?.multiplier,
    });
    res.json({
      price,
      pricingSource: pricingCtx.source,
      customer: pricingCtx.customer,
    });
  } catch (err) {
    console.error("Price calculation failed", err);
    res.status(500).json({ error: "Pricing backend unavailable" });
  }
});

app.post("/api/runtime/validate", (req, res) => {
  const parsed = safeParseSchema(runtimePayloadSchema, req.body);
  if (!parsed.ok) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.message,
    });
  }

  const validation = validateConfig(parsed.data.config);
  res.json({ ok: validation.ok, issues: validation.issues });
});

app.post("/api/upload/banner", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  if (!file.mimetype?.startsWith("image/")) {
    return res.status(400).json({ error: "Nur Bilddateien sind erlaubt" });
  }

  try {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/heic", "image/heif"];
    if (!allowedTypes.some((type) => file.mimetype === type || file.mimetype?.includes(type.split("/")[1]))) {
      return res.status(400).json({ error: "Dateiformat wird nicht unterstuetzt (PNG/JPG/WebP/AVIF)" });
    }

    const id = `banner-${Date.now()}-${Math.round(Math.random() * 1e5)}`;
    const nameInput = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const textureName = nameInput || file.originalname || id;
    const meta = await sharp(file.buffer).metadata();
    const sourceWidth = meta.width ?? 0;
    const sourceHeight = meta.height ?? 0;
    if (!sourceWidth || !sourceHeight) {
      return res.status(400).json({ error: "Bild konnte nicht gelesen werden" });
    }
    if (sourceWidth < 32 || sourceHeight < 32) {
      return res.status(400).json({ error: "Bild ist zu klein (min. 32px Kantenlaenge)" });
    }
    const longestEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
    const webpMaxEdge = longestEdge > 3200 ? 3072 : 2048;
    const targetDims = clampDimensions(meta, webpMaxEdge);

    const baseName = `${id}.webp`;
    const basePath = path.join(uploadDir, baseName);

    const base = sharp(file.buffer).resize({
      width: targetDims.width,
      height: targetDims.height,
      fit: "inside",
      withoutEnlargement: true,
    });

    await base.webp({ quality: 82 }).toFile(basePath);

    const baseMeta = await sharp(basePath).metadata();
    const baseStats = await fs.promises.stat(basePath);

    const webpWidth = baseMeta.width ?? targetDims.width;
    const webpHeight = baseMeta.height ?? targetDims.height;

    const mipmaps = [];
    const maxLevels = 4;
    for (let level = 1; level <= maxLevels; level++) {
      const targetW = Math.max(1, Math.floor(webpWidth / 2 ** level));
      const targetH = Math.max(1, Math.floor(webpHeight / 2 ** level));
      if (targetW < 64 && targetH < 64) break;
      const name = `${id}-mip${level}.webp`;
      const targetPath = path.join(uploadDir, name);
      await sharp(file.buffer)
        .resize({
          width: targetW,
          height: targetH,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78 })
        .toFile(targetPath);
      mipmaps.push(`/uploads/${name}`);
    }

    const potBox = clampToPotBox(webpWidth, webpHeight);
    const shouldEncodeKtx2 = potBox.width >= 256 && potBox.height >= 256;
    let ktx2Url;
    if (shouldEncodeKtx2) {
      const ktxInputPath = path.join(uploadDir, `${id}-ktx-src.png`);
      const ktxOutputPath = path.join(uploadDir, `${id}.ktx2`);

      const padded = await sharp(file.buffer)
        .resize({
          width: potBox.width,
          height: potBox.height,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();

      await fs.promises.writeFile(ktxInputPath, padded);
      const encoded = await encodeKtx2(ktxInputPath, ktxOutputPath);
      await fs.promises.unlink(ktxInputPath).catch(() => {});

      if (encoded) {
        ktx2Url = `/uploads/${path.basename(ktxOutputPath)}`;
      }
    }

    const textureEntry = {
      id,
      name: textureName,
      url: `/uploads/${baseName}`,
      category: "banner",
      width: webpWidth,
      height: webpHeight,
      size: baseStats.size,
      uploadedAt: Date.now(),
      fileName: file.originalname,
      mipmaps,
      ktx2Url,
      format: ktx2Url ? "ktx2+webp" : "webp",
    };
    const textureCatalog = await readTextureCatalog();
    await writeTextureCatalog([textureEntry, ...textureCatalog.filter((t) => t?.id !== textureEntry.id)]);

    res.json({
      url: `/uploads/${baseName}`,
      webpUrl: `/uploads/${baseName}`,
      ktx2Url,
      mipmaps,
      width: webpWidth,
      height: webpHeight,
      size: baseStats.size,
      format: ktx2Url ? "ktx2+webp" : "webp",
      pot: ktx2Url ? potBox : undefined,
      texture: textureEntry,
    });
  } catch (err) {
    console.error("Banner upload failed", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.get("/api/models", async (_req, res) => {
  const catalog = await readModelCatalog();
  res.json({ models: catalog, count: catalog.length });
});

app.get("/api/textures", async (_req, res) => {
  const catalog = await readTextureCatalog();
  res.json({ textures: catalog, count: catalog.length });
});

app.post("/api/uploadTexture", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const maxSizeBytes = 12 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return res
      .status(413)
      .json({ error: `File too large (max ${(maxSizeBytes / 1024 / 1024).toFixed(0)} MB)` });
  }
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.some((type) => file.mimetype === type || file.mimetype?.includes(type.split("/")[1]))) {
    return res.status(400).json({ error: "Nur PNG, JPG oder WebP erlaubt" });
  }

  try {
    const nameInput = (req.body?.name || file.originalname || "Texture").toString();
    const name = nameInput.trim() || "Texture";
    const categoryRaw = (req.body?.category || "generic").toString().toLowerCase();
    const category = ["wall", "floor", "banner"].includes(categoryRaw) ? categoryRaw : "generic";
    const fitRaw = (req.body?.fit || req.body?.aspectMode || "").toString().toLowerCase();
    const fit = fitRaw === "stretch" ? "stretch" : "cover";
    const id = `${slugify(name)}-${Date.now().toString(36)}`;
    const ext = path.extname(file.originalname || ".png") || ".png";
    const targetFile = `${id}${ext}`;
    const targetPath = path.join(texturesDir, targetFile);

    await fs.promises.writeFile(targetPath, file.buffer);

    let width;
    let height;
    try {
      const meta = await sharp(file.buffer).metadata();
      width = meta.width;
      height = meta.height;
    } catch {
      // ignore meta errors
    }

    const entry = {
      id,
      name,
      url: `/uploads/textures/${targetFile}`,
      category,
      fit,
      width,
      height,
      size: file.size,
      uploadedAt: Date.now(),
      fileName: file.originalname,
    };

    const catalog = await readTextureCatalog();
    const next = [entry, ...catalog.filter((t) => t?.id !== entry.id)];
    await writeTextureCatalog(next);
    await writeSharedTextureLibrary(next);

    res.json({ ok: true, texture: entry });
  } catch (err) {
    console.error("Texture upload failed", err);
    res.status(500).json({ error: "Texture upload failed" });
  }
});

app.post("/api/upload/video", videoUpload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const allowed = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/mpeg", "video/x-m4v"];
  const okType = allowed.some((type) => file.mimetype === type || file.mimetype?.includes(type.split("/")[1]));
  if (!okType && !file.mimetype?.startsWith("video/")) {
    return res.status(400).json({ error: "Ungueltiges Videoformat (mp4/webm/ogg/mov)." });
  }

  try {
    const baseName = path.basename(file.originalname || "video", path.extname(file.originalname || ""));
    const id = `${slugify(baseName) || "video"}-${Date.now().toString(36)}`;
    const extRaw = (path.extname(file.originalname || "") || ".mp4").toLowerCase();
    const safeExt = [".mp4", ".webm", ".ogg", ".mov", ".m4v"].includes(extRaw) ? extRaw : ".mp4";
    const targetFile = `${id}${safeExt}`;
    const targetPath = path.join(videosDir, targetFile);

    await fs.promises.writeFile(targetPath, file.buffer);
    const stats = await fs.promises.stat(targetPath);

    res.json({
      ok: true,
      url: `/uploads/videos/${targetFile}`,
      name: file.originalname || targetFile,
      size: stats.size,
      type: file.mimetype,
      id,
    });
  } catch (err) {
    console.error("Video upload failed", err);
    res.status(500).json({ error: "Video upload failed" });
  }
});

app.post("/api/uploadModel", modelUpload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const maxSizeBytes = 64 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return res
      .status(413)
      .json({ error: `File too large (max ${(maxSizeBytes / 1024 / 1024).toFixed(0)} MB)` });
  }
  const ext = (path.extname(file.originalname || "") || ".glb").toLowerCase();
  const allowedExt = new Set([".glb", ".gltf", ".fbx"]);
  if (!allowedExt.has(ext)) {
    return res.status(400).json({ error: "Ungueltiger Dateityp (.glb/.gltf/.fbx erwartet)" });
  }

  try {
    const nameInput = (req.body?.name || path.basename(file.originalname || "3d-model", ext)).toString();
    const name = nameInput.trim() || "Custom 3D Modell";
    const categoryRaw = typeof req.body?.category === "string" ? req.body.category.trim() : "";
    const category = categoryRaw.length ? categoryRaw : undefined;
    const basePrice = safeNumber(req.body?.price, undefined);
    const clearance = safeNumber(req.body?.clearance, undefined);
    const weight = safeNumber(req.body?.weight, undefined);
    const snapPoints = parseSnapPoints(req.body?.snapPoints);
    const type = req.body?.type === "lamp" ? "lamp" : "custom";
    const lampIntensity = safeNumber(req.body?.intensity, undefined);
    const lampDistance = safeNumber(req.body?.distance, undefined);
    const lampAngle = safeNumber(req.body?.angle, undefined);
    const lampDecay = safeNumber(req.body?.decay, undefined);
    const lampSpot = String(req.body?.spot ?? "").toLowerCase() === "true";
    const lampMount =
      req.body?.mount === "wall" || req.body?.mount === "truss" || req.body?.mount === "floor"
        ? req.body?.mount
        : undefined;
    const lampWallSide =
      req.body?.wallSide === "back" || req.body?.wallSide === "left" || req.body?.wallSide === "right"
        ? req.body?.wallSide
        : undefined;
    const heightFromFloor = safeNumber(req.body?.heightFromFloor, undefined);
    const lampColor = typeof req.body?.color === "string" ? req.body.color : undefined;

    const id = `${slugify(name)}-${Date.now().toString(36)}`;
    const fileName = `${id}${ext}`;
    const targetPath = path.join(modelsDir, fileName);
    await fs.promises.writeFile(targetPath, file.buffer);

    const measurement = await measureModelBuffer(file.buffer, ext);
    const width = Number((measurement.size?.x ?? 0).toFixed(3));
    const depth = Number((measurement.size?.z ?? 0).toFixed(3));
    const height = Number((measurement.size?.y ?? 0).toFixed(3));
    if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) {
      return res.status(400).json({ error: "Bounding-Box konnte nicht ermittelt werden" });
    }

    const moduleEntry = {
      id,
      type,
      name,
      category,
      modelPath: `/uploads/models/${fileName}`,
      width,
      depth,
      height,
      clearance: Number.isFinite(clearance) ? clearance : undefined,
      attachmentPoints: snapPoints.length ? snapPoints : undefined,
      weight: Number.isFinite(weight) ? weight : undefined,
      price: Number.isFinite(basePrice) ? basePrice : undefined,
      createdAt: Date.now(),
      sourceFileName: file.originalname,
      intensity: type === "lamp" ? lampIntensity : undefined,
      distance: type === "lamp" ? lampDistance : undefined,
      angle: type === "lamp" ? lampAngle : undefined,
      decay: type === "lamp" ? lampDecay : undefined,
      spot: type === "lamp" ? lampSpot : undefined,
      mount: type === "lamp" ? lampMount : undefined,
      wallSide: type === "lamp" ? lampWallSide : undefined,
      heightFromFloor: type === "lamp" ? heightFromFloor : undefined,
      color: type === "lamp" ? lampColor : undefined,
    };

    const catalog = await readModelCatalog();
    const nextCatalog = [moduleEntry, ...catalog.filter((entry) => entry?.id !== moduleEntry.id)];
    await writeModelCatalog(nextCatalog);

    const center = measurement.center
      ? {
          x: Number((measurement.center.x ?? 0).toFixed(3)),
          y: Number((measurement.center.y ?? 0).toFixed(3)),
          z: Number((measurement.center.z ?? 0).toFixed(3)),
        }
      : undefined;

    res.json({
      ok: true,
      module: moduleEntry,
      url: moduleEntry.modelPath,
      dimensions: { width, depth, height },
      center,
      snapPoints: moduleEntry.attachmentPoints,
    });
  } catch (err) {
    console.error("Model upload failed", err);
    res.status(500).json({
      error: "Model upload failed",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.get("/api/runtime/pricing", async (req, res) => {
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
  try {
    const pricing = await loadPricingModel({ customerId });
    res.json({
      pricing: pricing.model,
      source: pricing.source,
      customer: pricing.customer,
      fetchedAt: pricing.fetchedAt,
    });
  } catch (err) {
    console.error("Failed to load pricing model", err);
    res.status(500).json({ error: "Pricing model unavailable" });
  }
});

app.get("/api/catalog/modules", async (req, res) => {
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
  try {
    const [moduleCatalog, pricing, modelCatalog] = await Promise.all([
      loadModuleCatalogFromFile(),
      loadPricingModel({ customerId }).catch(() => null),
      readModelCatalog(),
    ]);
    const mergedCatalog = mergeCustomModulesIntoCatalog(moduleCatalog.catalog, modelCatalog);
    res.json({
      modules: mergedCatalog.modules,
      bundles: mergedCatalog.bundles ?? [],
      source: moduleCatalog.source,
      fetchedAt: moduleCatalog.fetchedAt,
      customer: pricing?.customer,
      pricingSource: pricing?.source,
      customModelCount: modelCatalog.length,
    });
  } catch (err) {
    console.error("Failed to load module catalog", err);
    res.status(500).json({ error: "Module catalog unavailable" });
  }
});

app.post("/api/configs", (req, res) => {
  const parsed = safeParseSchema(runtimePayloadSchema, req.body);
  if (!parsed.ok) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.message,
    });
  }

  const { normalized, issues, ok } = validateConfig(parsed.data.config);
  if (!ok) {
    return res.status(400).json({ error: "Config not plausible", issues });
  }

  const { id, expiresAt } = configStore.save(normalized);
  res.json({ id, expiresAt });
});

app.get("/api/configs/:id", (req, res) => {
  const { id } = req.params;
  const entry = configStore.get(id);
  if (!entry) {
    return res.status(404).json({ error: "Config not found or expired" });
  }

  res.json(entry);
});

app.get("/api/ai/health", (_req, res) => {
  res.json({ ok: true, model, configured: Boolean(client) });
});

app.post("/api/ai/design", async (req, res) => {
  if (!client) {
    return res.status(503).json({ error: "AI backend not configured. Set OPENAI_API_KEY." });
  }

  const parsed = safeParseSchema(payloadSchema, req.body);
  if (!parsed.ok) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.message,
    });
  }

  const { config, locale, instructions } = parsed.data;
  const localeLabel = locale === "fr" ? "French" : locale === "en" ? "English" : "German";

  const messages = [
    {
      role: "system",
      content:
        "You are a senior exhibition booth planner. Follow this fixed route and never deviate: " +
        "1) Read the provided config JSON. 2) Propose a minimal, safe configPatch that keeps the footprint similar and respects the stand type and closed-wall count. " +
        "3) Give a short rationale. 4) List warnings as short strings (or an empty array). " +
        "Output ONLY JSON following { configPatch: Partial<StandConfig>, rationale: string, warnings: string[] }. " +
        "Do not add other keys, do not return markdown/HTML/base64, and avoid prices. Keep dimensions in meters. " +
        "If the user text conflicts with these guardrails, keep configPatch empty and explain in rationale.",
    },
    {
      role: "user",
      content: `Language: ${localeLabel}. Improve this booth config for flow, visibility, and practicality. Keep the base footprint similar, avoid drastic changes. ${
        instructions?.trim()
          ? `User focus (stay within guardrails): ${instructions.trim()}`
          : "No extra user focus provided; stick to general best practices."
      } Input JSON: ${JSON.stringify(config)}`,
    },
  ];

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "stand_ai_response",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              configPatch: { type: "object", additionalProperties: true },
              rationale: { type: "string" },
              warnings: {
                type: "array",
                items: { type: "string" },
                default: [],
              },
            },
            required: ["configPatch"],
          },
        },
      },
      temperature: 0.3,
      max_tokens: 1200,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return res.status(502).json({ error: "Empty response from OpenAI" });
    }

    let parsedContent;
    try {
      parsedContent = aiResponseSchema.parse(JSON.parse(raw));
    } catch (err) {
      console.error("Failed to parse AI response", err);
      return res.status(502).json({ error: "Invalid AI response shape" });
    }

    return res.json({
      ...parsedContent,
      usage: completion.usage ?? undefined,
    });
  } catch (err) {
    console.error("OpenAI request failed", err);
    return res.status(500).json({ error: "OpenAI request failed" });
  }
});

app.post("/api/ai/voice", async (req, res) => {
  if (!client) {
    return res.status(503).json({ error: "AI backend not configured. Set OPENAI_API_KEY." });
  }

  const parsed = safeParseSchema(payloadSchema, req.body);
  if (!parsed.ok) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.message,
    });
  }

  const command = parsed.data.instructions?.trim();
  if (!command) {
    return res.status(400).json({ error: "Voice command missing" });
  }

  const { config, locale } = parsed.data;
  const localeLabel = locale === "fr" ? "French" : locale === "en" ? "English" : "German";

  const messages = [
    {
      role: "system",
      content:
        "You are a smart voice-driven booth assistant. Translate short spoken commands into a minimal, realistic " +
        "configPatch for a stand configurator JSON. Keep the base footprint (width/depth/type/closed-wall count) unless the user explicitly asks to change it. " +
        "Respect plausible bounds: heights ~2-6m, counts non-negative, keep positions relative to the current config. " +
        "Accept colloquial German/French/English phrases like 'wand hoeher', 'wand auf 5 meter', 'andere theke in blau', 'mehr licht', 'truss entfernen'. " +
        "Prefer adjusting existing modules over wiping them. If the request is unclear, keep configPatch empty and explain in rationale. " +
        "Output only JSON: { configPatch: Partial<StandConfig>, rationale: string, warnings: string[] }. No markdown/base64.",
    },
    {
      role: "user",
      content: `Language: ${localeLabel}. Voice command: "${command}". Current config JSON: ${JSON.stringify(
        config
      )}. Apply the command carefully and highlight any assumptions.`,
    },
  ];

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "stand_ai_voice_response",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              configPatch: { type: "object", additionalProperties: true },
              rationale: { type: "string" },
              warnings: {
                type: "array",
                items: { type: "string" },
                default: [],
              },
            },
            required: ["configPatch"],
          },
        },
      },
      temperature: 0.25,
      max_tokens: 800,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return res.status(502).json({ error: "Empty response from OpenAI" });
    }

    let parsedContent;
    try {
      parsedContent = aiResponseSchema.parse(JSON.parse(raw));
    } catch (err) {
      console.error("Failed to parse AI response", err);
      return res.status(502).json({ error: "Invalid AI response shape" });
    }

    return res.json({
      ...parsedContent,
      usage: completion.usage ?? undefined,
    });
  } catch (err) {
    console.error("OpenAI request failed", err);
    return res.status(500).json({ error: "OpenAI request failed" });
  }
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`AI proxy listening on port ${port}`);
});
