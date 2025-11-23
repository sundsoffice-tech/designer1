import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestAiVoiceCommand } from "../lib/aiClient";
import { useTranslation } from "../i18n";
import { useConfigStore } from "../store/configStore";

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

type SpeechAlternative = {
  transcript?: string;
  confidence?: number;
};

type SpeechResult = {
  isFinal?: boolean;
  [index: number]: SpeechAlternative | undefined;
};

type SpeechEvent = {
  results: ArrayLike<SpeechResult>;
};

type SpeechError = {
  error?: string;
  message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechError) => void) | null;
};

const localeForLanguage = (language: string) => {
  if (language === "en") return "en-US";
  if (language === "fr") return "fr-FR";
  return "de-DE";
};

export default function VoiceAssistant() {
  const { t, language } = useTranslation();
  const config = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);

  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRationale, setAiRationale] = useState("");
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [lastCommand, setLastCommand] = useState("");

  const aiLoadingRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    aiLoadingRef.current = aiLoading;
  }, [aiLoading]);

  const recognitionCtor = useMemo<SpeechRecognitionConstructorLike | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const w = window as typeof window & {
      webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
      SpeechRecognition?: SpeechRecognitionConstructorLike;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition;
  }, []);

  const speechLocale = localeForLanguage(language);
  const speechSupported = Boolean(recognitionCtor);

  const runVoiceCommand = useCallback(
    async (raw: string) => {
      const clean = raw.trim();
      if (!clean) return;
      if (aiLoadingRef.current) {
        setStatus(t("voice.status.busy"));
        return;
      }

      setAiError(null);
      setAiWarnings([]);
      setAiRationale("");
      setStatus(t("voice.applying"));
      setAiLoading(true);
      aiLoadingRef.current = true;

      try {
        const result = await requestAiVoiceCommand(config, language, clean);
        const patch =
          result?.configPatch && typeof result.configPatch === "object" ? result.configPatch : {};
        const hasPatch = patch && Object.keys(patch).length > 0;

        if (hasPatch) {
          setConfig(patch as any);
        }

        setAiRationale(result?.rationale || (hasPatch ? t("voice.applied") : t("voice.noChange")));
        setAiWarnings(result?.warnings ?? []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("voice.error");
        setAiError(msg);
      } finally {
        setAiLoading(false);
        aiLoadingRef.current = false;
        setStatus("");
      }
    },
    [config, language, setConfig, t]
  );

  useEffect(() => {
    if (!recognitionCtor) return;
    const recognition = new recognitionCtor();
    recognition.lang = speechLocale;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListening(true);
      setStatus(t("voice.status.listening"));
      setInterim("");
      setTranscript("");
      setAiError(null);
    };

    recognition.onend = () => {
      setListening(false);
      setStatus("");
    };

    recognition.onerror = (event) => {
      setListening(false);
      const blocked = event?.error === "not-allowed" || event?.error === "service-not-allowed";
      setAiError(blocked ? t("voice.permission") : t("voice.error"));
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      Array.from(event.results).forEach((res) => {
        const alt = res?.[0];
        const text = (alt?.transcript ?? "").trim();
        if (!text) return;

        if (res.isFinal) {
          finalText = `${finalText} ${text}`.trim();
        } else {
          interimText = `${interimText} ${text}`.trim();
        }
      });

      setInterim(interimText);
      if (finalText) {
        setTranscript(finalText);
        setLastCommand(finalText);
        void runVoiceCommand(finalText);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, [recognitionCtor, runVoiceCommand, speechLocale, t]);

  const startListening = () => {
    if (!recognitionRef.current) {
      setAiError(t("voice.unsupported"));
      return;
    }
    setInterim("");
    setTranscript("");
    setAiError(null);
    try {
      recognitionRef.current.lang = speechLocale;
      recognitionRef.current.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("voice.error");
      setAiError(msg);
    }
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore stop errors
    }
  };

  const handleManualSubmit = () => {
    const text = transcript.trim() || interim.trim();
    setLastCommand(text);
    void runVoiceCommand(text);
  };

  return (
    <div className="voice-assistant">
      <div className="voice-header">
        <div className="voice-headline">
          <div className="voice-kicker">{t("voice.title")}</div>
          <div className="voice-subtitle">{t("voice.subtitle")}</div>
        </div>
        <div className={`voice-pill ${listening ? "active" : ""}`}>
          <span className="voice-dot" />
          {listening ? t("voice.status.listening") : t("voice.status.idle")}
        </div>
      </div>

      <div className="voice-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={listening ? stopListening : startListening}
          disabled={!speechSupported}
        >
          {listening ? t("voice.stop") : t("voice.start")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleManualSubmit}
          disabled={aiLoading || (!transcript.trim() && !interim.trim())}
        >
          {aiLoading ? t("voice.applying") : t("voice.apply")}
        </button>
        <div className="voice-status-note">
          {speechSupported ? t("voice.hint") : t("voice.unsupported")}
        </div>
      </div>

      <label className="voice-input">
        <span className="voice-input-label">{t("voice.textLabel")}</span>
        <textarea
          value={interim ? `${transcript} ${interim}`.trim() : transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={t("voice.placeholder")}
          rows={2}
        />
      </label>

      {lastCommand && (
        <div className="voice-last">
          <span className="voice-last-label">{t("voice.lastCommand")}</span>
          <span className="voice-last-text">{lastCommand}</span>
        </div>
      )}

      {status && <div className="voice-status-note">{status}</div>}
      {aiError && <div className="ai-alert error">{aiError}</div>}
      {aiRationale && (
        <div className="ai-alert success">
          <strong>{t("ai.resultTitle")}</strong> {aiRationale}
          {aiWarnings.length > 0 && (
            <ul className="ai-warning-list">
              {aiWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
