import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiClientConfig } from "../config/ai";
import { requestAiVoiceCommand } from "../api/aiClient";
import { useTranslation } from "../i18n";
import { useConfigStore, type ConfigPatch } from "../store/configStore";
import { toErrorMessage } from "../utils/errorMessage";

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

const hasConfigPatch = (patch: ConfigPatch | null | undefined): patch is ConfigPatch => {
  if (!patch) return false;
  const { modules, ...rest } = patch;
  const hasRoot = Object.keys(rest ?? {}).length > 0;
  const hasModules = modules ? Object.keys(modules).length > 0 : false;
  return hasRoot || hasModules;
};

export default function VoiceAssistant() {
  const { t, language } = useTranslation();
  const config = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);
  const aiConfigured = aiClientConfig.enabled;
  const aiConfigWarning = aiConfigured
    ? ""
    : `KI-API nicht konfiguriert (${aiClientConfig.missing.join(", ") || "Umgebungsvariablen fehlen"}).`;

  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRationale, setAiRationale] = useState("");
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [lastCommand, setLastCommand] = useState("");
  const [micBlocked, setMicBlocked] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);

  const aiLoadingRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const listeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    aiLoadingRef.current = aiLoading;
  }, [aiLoading]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  const recognitionCtor = useMemo<SpeechRecognitionConstructorLike | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const w = window as typeof window & {
      webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
      SpeechRecognition?: SpeechRecognitionConstructorLike;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition;
  }, []);

  const setSessionActiveFlag = useCallback((active: boolean) => {
    setSessionActive(active);
    sessionActiveRef.current = active;
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & { permissions?: Permissions };
    if (!nav.permissions?.query) return;

    let permissionStatus: PermissionStatus | null = null;
    let cancelled = false;

    nav.permissions
      .query({ name: "microphone" })
      .then((statusResult) => {
        if (cancelled) return;
        permissionStatus = statusResult;
        const syncPermission = () => setMicBlocked(statusResult.state === "denied");
        syncPermission();
        statusResult.onchange = syncPermission;
      })
      .catch(() => {
        // permissions API not available or blocked
      });

    return () => {
      cancelled = true;
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, []);

  const speechLocale = localeForLanguage(language);
  const speechSupported = Boolean(recognitionCtor);
  const startDisabled = !speechSupported || !aiConfigured || micBlocked;
  const applyDisabled =
    aiLoading || !aiConfigured || (!transcript.trim() && !interim.trim());
  const statusNote = !aiConfigured
    ? aiConfigWarning || "Sprachassistent deaktiviert."
    : micBlocked
    ? t("voice.permission")
    : speechSupported
    ? t("voice.hint")
    : t("voice.unsupported");

  const runVoiceCommand = useCallback(
    async (raw: string) => {
      const clean = raw.trim();
      if (!clean) return;
      if (!sessionActiveRef.current) {
        setAiError(t("voice.inactive"));
        setStatus("");
        return;
      }
      if (aiLoadingRef.current) {
        setStatus(t("voice.status.busy"));
        return;
      }
      if (!aiConfigured) {
        setAiError("Sprachassistenz deaktiviert (KI-API nicht konfiguriert).");
        setStatus("");
        setSessionActiveFlag(false);
        return;
      }

      setAiError(null);
      setAiWarnings([]);
      setAiRationale("");
      setStatus(t("voice.applying"));
      setAiLoading(true);
      aiLoadingRef.current = true;

      try {
        const result = await requestAiVoiceCommand({
          config,
          locale: speechLocale,
          instructions: clean,
        });
        const patch: ConfigPatch = result.configPatch ?? {};
        const hasPatch = hasConfigPatch(patch);

        if (hasPatch) {
          setConfig(patch);
        }

        setAiRationale(result.rationale || (hasPatch ? t("voice.applied") : t("voice.noChange")));
        setAiWarnings(result.warnings ?? []);
      } catch (err) {
        setAiError(toErrorMessage(err, t("voice.error")));
      } finally {
        setAiLoading(false);
        aiLoadingRef.current = false;
        setStatus("");
        setSessionActiveFlag(listeningRef.current);
      }
    },
    [aiConfigured, config, setConfig, setSessionActiveFlag, speechLocale, t]
  );

  useEffect(() => {
    if (!recognitionCtor || !aiConfigured) return;
    const recognition = new recognitionCtor();
    recognition.lang = speechLocale;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setSessionActiveFlag(true);
      setMicBlocked(false);
      setListening(true);
      setStatus(t("voice.status.listening"));
      setInterim("");
      setTranscript("");
      setAiError(null);
    };

    recognition.onend = () => {
      setListening(false);
      setSessionActiveFlag(false);
      setStatus("");
    };

    recognition.onerror = (event) => {
      setListening(false);
      setSessionActiveFlag(false);
      const blocked = event?.error === "not-allowed" || event?.error === "service-not-allowed";
      if (blocked) {
        setMicBlocked(true);
      }
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
  }, [aiConfigured, recognitionCtor, runVoiceCommand, setSessionActiveFlag, speechLocale, t]);

  const isPermissionError = (err: unknown) =>
    err instanceof DOMException &&
    (err.name === "NotAllowedError" || err.name === "SecurityError");

  const startListening = () => {
    if (!aiConfigured) {
      setAiError("Sprachassistenz deaktiviert (KI-API nicht konfiguriert).");
      return;
    }
    if (!recognitionRef.current) {
      setAiError(t("voice.unsupported"));
      return;
    }
    setInterim("");
    setTranscript("");
    setAiError(null);
    setSessionActiveFlag(true);
    try {
      recognitionRef.current.lang = speechLocale;
      recognitionRef.current.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("voice.error");
      if (isPermissionError(err)) {
        setMicBlocked(true);
      }
      setSessionActiveFlag(false);
      setAiError(msg);
    }
  };

  const stopListening = () => {
    setSessionActiveFlag(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore stop errors
    }
  };

  const handleManualSubmit = () => {
    if (!aiConfigured) {
      setAiError("Sprachassistenz deaktiviert (KI-API nicht konfiguriert).");
      return;
    }
    const text = transcript.trim() || interim.trim();
    if (!text) return;
    setSessionActiveFlag(true);
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

      {!aiConfigured && <div className="ai-alert warning">{aiConfigWarning}</div>}
      {!speechSupported && aiConfigured && (
        <div className="ai-alert warning">{t("voice.unsupported")}</div>
      )}
      {micBlocked && aiConfigured && (
        <div className="ai-alert warning">{t("voice.permission")}</div>
      )}

      <div className="voice-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={listening ? stopListening : startListening}
          disabled={startDisabled}
        >
          {listening ? t("voice.stop") : t("voice.start")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleManualSubmit}
          disabled={applyDisabled}
        >
          {aiLoading ? t("voice.applying") : t("voice.apply")}
        </button>
        <div className="voice-status-note">
          {statusNote}
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
