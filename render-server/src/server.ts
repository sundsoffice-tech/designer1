import fs from "fs";
import path from "path";
import express from "express";
import puppeteer from "puppeteer";
import dotenv from "dotenv";
import type { StandConfig } from "../ss-messebau-configurator/src/lib/pricing";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));

const OUTPUT_DIR = path.resolve(process.cwd(), "render-output");
const FRONTEND_RENDER_URL = process.env.RENDER_PAGE_URL ??
  "http://localhost:4173/render";

async function ensureOutputDir() {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
}

app.post("/render", async (req, res) => {
  const config = req.body as StandConfig;

  if (!config || typeof config !== "object") {
    return res.status(400).json({ error: "Invalid or missing config" });
  }

  let browser: puppeteer.Browser | null = null;
  let tempPath: string | null = null;

  try {
    await ensureOutputDir();
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setViewport({ width: 3840, height: 2160 });

    const configParam = encodeURIComponent(JSON.stringify(config));
    const targetUrl = `${FRONTEND_RENDER_URL}?config=${configParam}`;
    await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 60000 });

    await page.waitForFunction(
      () => (window as typeof window & { renderReady?: boolean }).renderReady === true,
      { timeout: 60000 }
    );

    const fileName = `render-${Date.now()}.png`;
    tempPath = path.join(OUTPUT_DIR, fileName);
    await page.screenshot({ path: tempPath, type: "png", fullPage: true });

    res.setHeader("Content-Type", "image/png");
    res.sendFile(tempPath, (err) => {
      if (err) {
        res.status(500).json({ error: "Failed to send screenshot" });
      }
    });
  } catch (error) {
    console.error("Render error", error);
    res.status(500).json({ error: "Render failed" });
  } finally {
    if (browser) {
      await browser.close();
    }
    if (tempPath) {
      fs.promises.unlink(tempPath).catch(() => {});
    }
  }
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Render server listening on port ${port}`);
});
