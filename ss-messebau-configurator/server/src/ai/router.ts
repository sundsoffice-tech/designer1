import { Router } from "express";
import { z } from "zod";
import { withCache } from "../middleware/cache";
import { openai } from "./openaiClient";
import type { StandConfigPatch } from "./types";

export const aiRouter = Router();

// 1) Stand aus Textbeschreibung
const standFromTextSchema = z.object({
  prompt: z.string().min(10),
  locale: z.string().optional(), // z.B. "de-DE"
  budget: z.number().optional(), // optionales Budget
});

async function standFromTextHandler(req: any, res: any) {
  const parse = standFromTextSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid payload", issues: parse.error.issues });
  }
  const { prompt, locale = "de-DE", budget } = parse.data;

  try {
    const systemPrompt = `
      Du bist ein Messestand-Designer. 
      Du erhaelst eine natuerliche Beschreibung eines Messestands.
      Antworte ausschliesslich mit einem JSON-Objekt, das zu folgendem TypeScript passt:

      type StandConfigPatch = {
        width?: number;
        depth?: number;
        height?: number;
        type?: "row" | "corner" | "head" | "island";
        region?: string;
        rush?: boolean;
        modules?: {
          wallsClosedSides?: number;
          storageRoom?: boolean;
          storageDoorSide?: "front" | "left" | "right" | "back";
          ledFrames?: number;
          ledWall?: "back" | "left" | "right" | "front";
          counters?: number;
          countersWall?: "front" | "back" | "left" | "right" | "island";
          countersWithPower?: boolean;
          screens?: number;
          screensWall?: "front" | "back" | "left" | "right";
          truss?: boolean;
          raisedFloor?: boolean;
          // weitere Felder bleiben unangetastet
        };
      };

      JSON-Only Antwort. Keine Kommentare, kein Text ausserhalb von JSON.
      Budget (falls vorhanden): ${budget ?? "kein Budget angegeben"}.
      Sprache des Kunden: ${locale}.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: "No response from model" });
    }

    const patch = JSON.parse(content) as StandConfigPatch;
    return res.json({ patch });
  } catch (err: any) {
    console.error("stand-from-text error", err);
    return res.status(500).json({ error: "AI error", detail: err.message });
  }
}

aiRouter.post(
  "/stand-from-text",
  withCache(
    (body) => `stand:${body.prompt}:${body.budget ?? ""}`,
    standFromTextHandler
  )
);

const marketingSchema = z.object({
  prompt: z.string().min(5), // z.B. Zielgruppe/Zweck
  language: z.string().default("de"),
});

aiRouter.post("/marketing-copy", async (req, res) => {
  const parse = marketingSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid payload", issues: parse.error.issues });
  }
  const { prompt, language } = parse.data;

  const sys = `
    Du schreibst kurze Werbetexte fuer Messestaende.
    Antworte mit JSON:
    {
      "headline": string,
      "subline": string,
      "body": string
    }
    Sprache: ${language}
  `;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return res.status(500).json({ error: "No response" });

  const data = JSON.parse(content);
  res.json(data);
});

// Bild-Generierung (vereinfachtes Beispiel)
const bannerSchema = z.object({
  prompt: z.string().min(10),
  size: z.enum(["1024x1024", "1024x576"]).default("1024x576"),
});

aiRouter.post("/banner-image", async (req, res) => {
  const parse = bannerSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid payload", issues: parse.error.issues });
  }
  const { prompt, size } = parse.data;

  try {
    const image = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size,
    });

    const imageUrl = image.data[0]?.url;
    if (!imageUrl) return res.status(500).json({ error: "No image URL" });

    res.json({ imageUrl });
  } catch (err: any) {
    console.error("banner-image error", err);
    res.status(500).json({ error: "AI image error", detail: err.message });
  }
});
