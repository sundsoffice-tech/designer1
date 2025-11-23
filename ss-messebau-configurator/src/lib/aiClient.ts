import { aiClientConfig, aiHeaders } from "../config/ai";
import type { StandConfig, StandModules } from "./pricing";

type StandConfigPatch = Partial<Omit<StandConfig, "modules">> & {
  modules?: Partial<StandModules> & Record<string, unknown>;
};

type AiStandFromTextParams = {
  prompt: string;
  locale?: string;
  budget?: number;
};

type AiMarketingCopyParams = {
  prompt: string;
  language?: string;
};

type AiBannerImageParams = {
  prompt: string;
  size?: "1024x1024" | "1024x576";
};

type AiVoiceCommandParams = {
  config: StandConfig;
  locale?: string;
  instructions: string;
};

type AiMarketingCopyResult = {
  headline: string;
  subline: string;
  body: string;
};

type AiBannerImageResult = { imageUrl: string };

type AiVoiceCommandResult = {
  configPatch: StandConfigPatch;
  rationale: string;
  warnings: string[];
};

type AiErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  detail?: unknown;
  details?: unknown;
  issues?: unknown;
};

export class AiClientError extends Error {
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

const safeJson = async (res: Response) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const toAiClientError = async (res: Response, fallback: string) => {
  const body = (await safeJson(res)) as AiErrorBody | null;
  const message =
    (typeof body?.error === "string" && body.error) ||
    (typeof body?.message === "string" && body.message) ||
    fallback;
  const details = body?.detail ?? body?.details ?? body?.issues ?? body ?? undefined;
  const code =
    (typeof body?.code === "string" && body.code) ||
    (res.status >= 500 ? "server_error" : "request_failed");

  return new AiClientError(message, {
    status: res.status,
    code,
    details,
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

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

    try {
      return (await res.json()) as T;
    } catch (parseError) {
      throw new AiClientError("Ungueltige Antwort vom KI-Backend.", {
        code: "invalid_response",
        cause: parseError,
      });
    }
  } catch (err) {
    if (err instanceof AiClientError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : fallbackMessage;
    throw new AiClientError(message || fallbackMessage, {
      code: "network_error",
      cause: err,
    });
  }
};

/**
 * Generates a stand configuration patch from a free-form text description.
 * @returns Partial stand configuration patch suggested by the AI backend.
 */
export async function aiStandFromText(
  params: AiStandFromTextParams
): Promise<StandConfigPatch> {
  const payload = {
    prompt: params.prompt.trim(),
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
    "Konnte Stand nicht aus Text generieren."
  );

  if (isRecord(data?.patch)) {
    return data.patch as StandConfigPatch;
  }

  return {};
}

/**
 * Requests short marketing copy (headline, subline, body) for the current stand.
 * @returns Localized marketing copy strings.
 */
export async function aiMarketingCopy(
  params: AiMarketingCopyParams
): Promise<AiMarketingCopyResult> {
  const payload = {
    prompt: params.prompt.trim(),
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
 * Requests a banner image URL for the given prompt.
 * @returns Generated image URL (hosted by the backend).
 */
export async function aiBannerImage(
  params: AiBannerImageParams
): Promise<AiBannerImageResult> {
  const payload = {
    prompt: params.prompt.trim(),
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
 * Applies a spoken/written voice command against the current stand config.
 * @returns AI-suggested patch plus rationale and optional warnings.
 */
export async function requestAiVoiceCommand(
  params: AiVoiceCommandParams
): Promise<AiVoiceCommandResult> {
  const instructions = params.instructions.trim();
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

  const patch = isRecord(data?.configPatch) ? data.configPatch : {};
  const rationale = typeof data?.rationale === "string" ? data.rationale : "";
  const warnings = Array.isArray(data?.warnings)
    ? data.warnings.filter((w): w is string => typeof w === "string")
    : [];

  return { configPatch: patch as StandConfigPatch, rationale, warnings };
}
