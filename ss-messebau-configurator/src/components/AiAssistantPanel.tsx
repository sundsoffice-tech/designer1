import { useState } from "react";
import { aiStandFromText, aiMarketingCopy, aiBannerImage } from "../api/aiClient";
import type { StandConfig } from "../lib/pricing";
import { useConfigStore } from "../store/configStore";

export function AiAssistantPanel() {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState<null | "stand" | "text" | "image">(null);
  const [error, setError] = useState<string | null>(null);

  const replaceConfig = useConfigStore((s) => s.replaceConfig);
  const config = useConfigStore((s) => s.config);

  async function handleGenerateStand() {
    setLoading("stand");
    setError(null);
    try {
      const patch = await aiStandFromText({
        prompt: description,
        locale: "de-DE",
      });

      // aktuelle Config + Patch mergen und replaceConfig verwenden
      const merged: StandConfig = {
        ...config,
        ...patch,
        modules: {
          ...config.modules,
          ...(patch.modules ?? {}),
        },
      } as StandConfig;
      replaceConfig(merged);
    } catch (e: any) {
      setError(e?.message ?? "Fehler bei der KI-Konfiguration");
    } finally {
      setLoading(null);
    }
  }

  async function handleGenerateTexts() {
    setLoading("text");
    setError(null);
    try {
      const texts = await aiMarketingCopy({
        prompt: description || "Messestand fuer " + config.region,
        language: "de",
      });
      // Texte z.B. nur anzeigen oder in eigenen Store packen
      alert(
        `Headline: ${texts.headline}\n\nSubline: ${texts.subline}\n\nText: ${texts.body}`
      );
    } catch (e: any) {
      setError(e?.message ?? "Fehler bei der Textgenerierung");
    } finally {
      setLoading(null);
    }
  }

  async function handleGenerateBanner() {
    setLoading("image");
    setError(null);
    try {
      const { imageUrl } = await aiBannerImage({
        prompt:
          description ||
          "Hochwertiger Messestand mit moderner Lichttechnik, klare Markenbotschaft",
        size: "1024x576",
      });

      // Beispiel: Banner-URL ins modules-Objekt schreiben
      // (euer mergeModules kann damit umgehen)
      useConfigStore.getState().setConfig({
        modules: {
          trussBannerImageUrl: imageUrl,
        } as any,
      });
    } catch (e: any) {
      setError(e?.message ?? "Fehler bei der Bildgenerierung");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ padding: "1rem", borderTop: "1px solid #eee" }}>
      <h3>KI-Assistent</h3>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Beschreibe deinen Wunsch-Messestand in eigenen Worten..."
        rows={5}
        style={{ width: "100%" }}
      />
      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button onClick={handleGenerateStand} disabled={loading !== null}>
          {loading === "stand" ? "Konfiguriere..." : "Stand automatisch konfigurieren"}
        </button>
        <button onClick={handleGenerateTexts} disabled={loading !== null}>
          {loading === "text" ? "Texte..." : "Werbetexte generieren"}
        </button>
        <button onClick={handleGenerateBanner} disabled={loading !== null}>
          {loading === "image" ? "Bild..." : "Banner-Bild generieren"}
        </button>
      </div>
      {error && <p style={{ color: "red", marginTop: "0.5rem" }}>{error}</p>}
    </div>
  );
}
