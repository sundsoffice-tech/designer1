import { useState } from "react";
import { aiStandFromText, aiMarketingCopy, aiBannerImage } from "../api/aiClient";
import { useConfigStore } from "../store/configStore";
import { aiClientConfig } from "../config/ai";
import { toErrorMessage } from "../utils/errorMessage";

export function AiAssistantPanel() {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState<null | "stand" | "text" | "image">(null);
  const [error, setError] = useState<string | null>(null);

  const setConfig = useConfigStore((s) => s.setConfig);
  const config = useConfigStore((s) => s.config);

  async function handleGenerateStand() {
    if (!aiClientConfig.enabled) {
      setError("KI-Assistent ist nicht konfiguriert (VITE_AI_API_BASE/VITE_AI_API_KEY).");
      return;
    }
    setLoading("stand");
    setError(null);
    try {
      const patch = await aiStandFromText({
        prompt: description,
        locale: "de-DE",
      });

      setConfig(patch);
    } catch (err) {
      setError(toErrorMessage(err, "Fehler bei der KI-Konfiguration"));
    } finally {
      setLoading(null);
    }
  }

  async function handleGenerateTexts() {
    if (!aiClientConfig.enabled) {
      setError("KI-Assistent ist nicht konfiguriert (VITE_AI_API_BASE/VITE_AI_API_KEY).");
      return;
    }
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
    } catch (err) {
      setError(toErrorMessage(err, "Fehler bei der Textgenerierung"));
    } finally {
      setLoading(null);
    }
  }

  async function handleGenerateBanner() {
    if (!aiClientConfig.enabled) {
      setError("KI-Assistent ist nicht konfiguriert (VITE_AI_API_BASE/VITE_AI_API_KEY).");
      return;
    }
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
      setConfig({ modules: { trussBannerMipmaps: [imageUrl] } });
    } catch (err) {
      setError(toErrorMessage(err, "Fehler bei der Bildgenerierung"));
    } finally {
      setLoading(null);
    }
  }

  const aiUnavailableMessage = aiClientConfig.enabled
    ? null
    : `KI ist deaktiviert. Bitte setze ${aiClientConfig.missing.join(" und ")}.`;
  const actionsDisabled = loading !== null || !aiClientConfig.enabled;

  return (
    <div style={{ padding: "1rem", borderTop: "1px solid #eee" }}>
      <h3>KI-Assistent</h3>
      {aiUnavailableMessage && <p className="ai-alert warning">{aiUnavailableMessage}</p>}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Beschreibe deinen Wunsch-Messestand in eigenen Worten..."
        rows={5}
        style={{ width: "100%" }}
      />
      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button onClick={handleGenerateStand} disabled={actionsDisabled}>
          {loading === "stand" ? "Konfiguriere..." : "Stand automatisch konfigurieren"}
        </button>
        <button onClick={handleGenerateTexts} disabled={actionsDisabled}>
          {loading === "text" ? "Texte..." : "Werbetexte generieren"}
        </button>
        <button onClick={handleGenerateBanner} disabled={actionsDisabled}>
          {loading === "image" ? "Bild..." : "Banner-Bild generieren"}
        </button>
      </div>
      {error && <p style={{ color: "red", marginTop: "0.5rem" }}>{error}</p>}
    </div>
  );
}
