import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import { OpenAI } from "openai";
import { z } from "zod";
import { aiRouter } from "./src/ai/router.js";
import { buildSceneAabbs, DEFAULT_CLEARANCE, intersects } from "./shared/collision.js";
import { PersistentConfigStore, safeNumber } from "./shared/configStore.js";
import { calcPrice } from "./shared/pricing.js";
import { loadPricingModel } from "./shared/pricingData.js";

const app = express();

const corsOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});
const uploadDir = path.resolve(process.cwd(), "uploads");
await fs.promises.mkdir(uploadDir, { recursive: true });

app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true,
  })
);
app.use(express.json({ limit: "1mb" }));
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
    const id = `banner-${Date.now()}-${Math.round(Math.random() * 1e5)}`;
    const meta = await sharp(file.buffer).metadata();
    const baseName = `${id}.webp`;
    const basePath = path.join(uploadDir, baseName);
    const maxDim = 4096;
    const base = sharp(file.buffer).resize({
      width: Math.min(meta.width ?? maxDim, maxDim),
      height: Math.min(meta.height ?? maxDim, maxDim),
      fit: "inside",
      withoutEnlargement: true,
    });

    await base.webp({ quality: 82 }).toFile(basePath);

    const mipmaps = [];
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const maxLevels = 4;
    for (let level = 1; level <= maxLevels; level++) {
      const targetW = Math.max(1, Math.floor(width / 2 ** level));
      const targetH = Math.max(1, Math.floor(height / 2 ** level));
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

    res.json({
      url: `/uploads/${baseName}`,
      mipmaps,
      width: meta.width,
      height: meta.height,
      size: file.size,
      format: "webp",
    });
  } catch (err) {
    console.error("Banner upload failed", err);
    res.status(500).json({ error: "Upload failed" });
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
    const pricing = await loadPricingModel({ customerId });
    res.json({
      modules: pricing.model.modules || {},
      source: pricing.source,
      customer: pricing.customer,
      fetchedAt: pricing.fetchedAt,
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
