import { aiClientConfig, aiHeaders } from "../config/ai";
import type {
  AiBannerImageParams,
  AiBannerImageResult,
  AiDesignParams,
  AiDesignResult,
  AiErrorBody,
  AiMarketingCopyParams,
  AiMarketingCopyResult,
  AiStandFromTextParams,
  AiUsage,
  AiVoiceCommandParams,
  AiVoiceCommandResult,
  ApiError,
  StandConfigPatch,
} from "../types/ai";

export type {
  AiBannerImageParams,
  AiBannerImageResult,
  AiConfig,
  AiConfigPatch,
  AiDesignParams,
  AiDesignResult,
  AiErrorBody,
  AiMarketingCopyParams,
  AiMarketingCopyResult,
  AiStandFromTextParams,
  AiUsage,
  AiVoiceCommandParams,
  AiVoiceCommandResult,
  ApiError,
  StandConfigPatch,
} from "../types/ai";

/**
 * Fehler, die beim Kommunizieren mit dem KI-Backend auftreten.
 */
export class AiClientError extends Error implements ApiError {
  status?: number;
  code?: string;
  details?: unknown;

  constructor(
    message: string,
    options: { status?: number; code?: string; details?: unknown; cause?: unknown } = {}
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "AiClientError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

const aiDisabled =
  import.meta.env.VITE_DISABLE_AI === "true" || import.meta.env.VITE_DISABLE_RUNTIME === "true";

const missingConfigMessage = () =>
  `KI-API nicht konfiguriert (${aiClientConfig.missing.join(", ") || "VITE_AI_API_BASE/VITE_AI_API_KEY"}).`;

const ensureAiReady = () => {
  if (aiDisabled) {
    throw new AiClientError("KI-API ist deaktiviert (VITE_DISABLE_AI/VITE_DISABLE_RUNTIME).", {
      code: "ai_disabled",
    });
  }
  if (!aiClientConfig.enabled || !aiClientConfig.baseUrl) {
    throw new AiClientError(missingConfigMessage(), {
      code: "ai_not_configured",
    });
  }
};

const buildUrl = (path: string) => `${aiClientConfig.baseUrl!}${path}`;

const safeJson = async (res: Response): Promise<unknown | null> => {
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
};

const statusFallbackMessage = (status: number) => {
  if (status === 401 || status === 403) {
    return "KI-Anfrage wurde abgelehnt (API-Key pruefen).";
  }
  if (status === 404) {
    return "KI-Endpunkt nicht gefunden (Basis-URL pruefen).";
  }
  if (status === 429) {
    return "KI-Rate-Limit erreicht. Bitte spaeter erneut versuchen.";
  }
  if (status >= 500) {
    return "KI-Backend meldet einen Fehler.";
  }
  return "KI-Anfrage fehlgeschlagen.";
};

const toAiClientError = async (res: Response, fallback: string) => {
  const body = (await safeJson(res)) as AiErrorBody | null;
  const bodyMessage =
    (typeof body?.error === "string" && body.error) ||
    (typeof body?.message === "string" && body.message) ||
    null;
  const details = body?.detail ?? body?.details ?? body?.issues ?? body ?? undefined;
  const code =
    (typeof body?.code === "string" && body.code) ||
    (res.status >= 500 ? "server_error" : "request_failed");

  const message = bodyMessage || fallback || statusFallbackMessage(res.status);
  return new AiClientError(message, {
    status: res.status,
    code,
    details,
  });
};

const parseJsonOrThrow = async <T>(res: Response): Promise<T> => {
  try {
    const json = (await res.json()) as unknown;
    return json as T;
  } catch (err) {
    throw new AiClientError("Ungueltige Antwort vom KI-Backend.", {
      code: "invalid_response",
      status: res.status,
      cause: err,
    });
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isStandConfigPatch = (value: unknown): value is StandConfigPatch => isRecord(value);

const isModulePatch = (value: unknown): value is StandConfigPatch["modules"] => isRecord(value);

const normalizeConfigPatch = (value: unknown): StandConfigPatch => {
  if (!isStandConfigPatch(value)) return {};
  const { modules, ...rest } = value;
  const patch: StandConfigPatch = {};
  Object.assign(patch, rest);
  if (isModulePatch(modules)) {
    patch.modules = modules;
  }
  return patch;
};

const normalizeUsage = (value: unknown): AiUsage | undefined =>
  isRecord(value) ? value : undefined;

const toNetworkError = (err: unknown) =>
  new AiClientError("Verbindung zur KI-API fehlgeschlagen. Bitte Basis-URL oder Netzwerk pruefen.", {
    code: "network_error",
    cause: err,
    details: err instanceof Error ? err.message : err,
  });

const postJson = async <T>(
  path: string,
  payload: unknown,
  fallbackMessage: string
): Promise<T> => {
  ensureAiReady();

  try {
    const res = await fetch(buildUrl(path), {
      method: "POST",
      headers: aiHeaders(),
      body: JSON.stringify(payload ?? {}),
    });

    if (!res.ok) {
      throw await toAiClientError(res, fallbackMessage);
    }

    return await parseJsonOrThrow<T>(res);
  } catch (err) {
    if (err instanceof AiClientError) {
      throw err;
    }
    throw toNetworkError(err);
  }
};

/**
 * Erzeugt aus einer freien Textbeschreibung einen Patch fuer die Standkonfiguration.
 *
 * @param params Freitextbeschreibung plus optionale Locale/Budget.
 * @returns Teilkonfiguration, die sich mit dem Store mergen laesst.
 * @throws AiClientError bei Validierungs-, Netzwerk- oder Backend-Fehlern.
 */
export async function aiStandFromText(
  params: AiStandFromTextParams
): Promise<StandConfigPatch> {
  const payload = {
    prompt: params.prompt?.trim(),
    locale: params.locale,
    budget: params.budget,
  };

  if (!payload.prompt) {
    throw new AiClientError("Bitte gib eine Beschreibung fuer den Stand ein.", {
      code: "validation",
    });
  }

  const data = await postJson<{ patch?: unknown }>(
    "/api/ai/stand-from-text",
    payload,
    "Stand konnte nicht aus Text generiert werden."
  );
  return normalizeConfigPatch(data?.patch);
}

/**
 * Generiert kurze Werbetexte (Headline/Subline/Body) fuer den aktuellen Stand.
 *
 * @param params Prompt plus optionale Sprachwahl.
 * @returns Marketing-Texte als Strings (leer, falls nicht geliefert).
 * @throws AiClientError bei Validierungs-, Netzwerk- oder Backend-Fehlern.
 */
export async function aiMarketingCopy(
  params: AiMarketingCopyParams
): Promise<AiMarketingCopyResult> {
  const payload = {
    prompt: params.prompt?.trim(),
    language: params.language?.trim() || "de",
  };

  if (!payload.prompt) {
    throw new AiClientError("Bitte gib einen Kontext fuer die Werbetexte ein.", {
      code: "validation",
    });
  }

  const data = await postJson<Partial<AiMarketingCopyResult>>(
    "/api/ai/marketing-copy",
    payload,
    "Werbetexte konnten nicht generiert werden."
  );

  return {
    headline: typeof data.headline === "string" ? data.headline : "",
    subline: typeof data.subline === "string" ? data.subline : "",
    body: typeof data.body === "string" ? data.body : "",
  };
}

/**
 * Fordert ein Bannerbild fuer einen gegebenen Prompt an.
 *
 * @param params Prompt und optionale Groesse.
 * @returns Vom Backend gehostete Bild-URL.
 * @throws AiClientError bei Validierungs-, Netzwerk- oder Backend-Fehlern.
 */
export async function aiBannerImage(
  params: AiBannerImageParams
): Promise<AiBannerImageResult> {
  const payload = {
    prompt: params.prompt?.trim(),
    size: params.size ?? "1024x576",
  };

  if (!payload.prompt) {
    throw new AiClientError("Bitte gib ein Motiv fuer das Banner an.", {
      code: "validation",
    });
  }

  const data = await postJson<Partial<AiBannerImageResult>>(
    "/api/ai/banner-image",
    payload,
    "Banner-Bild konnte nicht generiert werden."
  );

  if (typeof data.imageUrl === "string" && data.imageUrl.trim()) {
    return { imageUrl: data.imageUrl };
  }

  throw new AiClientError("Die KI hat keine Bild-URL zurueckgegeben.", {
    code: "invalid_response",
  });
}

/**
 * Fragt ein KI-Redesign des aktuellen Stands an.
 *
 * @param params Aktuelle Config plus optionale Locale/Instruktionen.
 * @returns Konfig-Patch, rationale Erklaerung und optionale Warnungen.
 * @throws AiClientError bei Validierungs-, Netzwerk- oder Backend-Fehlern.
 */
export async function requestAiDesign(params: AiDesignParams): Promise<AiDesignResult> {
  if (!params?.config) {
    throw new AiClientError("Standkonfiguration fehlt fuer die KI-Anfrage.", {
      code: "validation",
    });
  }

  const data = await postJson<Partial<AiDesignResult>>(
    "/api/ai/design",
    {
      config: params.config,
      locale: params.locale,
      instructions: params.instructions?.trim() || undefined,
    },
    "KI-Design konnte nicht berechnet werden."
  );

  const configPatch = normalizeConfigPatch(data?.configPatch);
  const rationale = typeof data?.rationale === "string" ? data.rationale : "";
  const warnings = Array.isArray(data?.warnings)
    ? data.warnings.filter((w): w is string => typeof w === "string")
    : [];

  return { configPatch, rationale, warnings, usage: normalizeUsage(data?.usage) };
}

/**
 * Interpretiert einen Sprach- oder Texteingabebefehl gegen die aktuelle Config.
 *
 * @param params Aktuelle Config, Locale und Instruktionen.
 * @returns Patch, rationale Erklaerung und optionale Warnungen.
 * @throws AiClientError bei Validierungs-, Netzwerk- oder Backend-Fehlern.
 */
export async function requestAiVoiceCommand(
  params: AiVoiceCommandParams
): Promise<AiVoiceCommandResult> {
  const instructions = params.instructions?.trim();
  if (!instructions) {
    throw new AiClientError("Sprachbefehl ist leer.", {
      code: "validation",
    });
  }

  const data = await postJson<Partial<AiVoiceCommandResult>>(
    "/api/ai/voice",
    {
      config: params.config,
      locale: params.locale,
      instructions,
    },
    "Sprachkommando konnte nicht interpretiert werden."
  );

  const configPatch = normalizeConfigPatch(data?.configPatch);
  const rationale = typeof data?.rationale === "string" ? data.rationale : "";
  const warnings = Array.isArray(data?.warnings)
    ? data.warnings.filter((w): w is string => typeof w === "string")
    : [];

  return { configPatch, rationale, warnings, usage: normalizeUsage(data?.usage) };
}
