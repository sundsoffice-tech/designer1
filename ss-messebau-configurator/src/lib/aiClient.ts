import { apiBaseUrl } from "./apiBase";
import type { StandConfig } from "./pricing";

export type AiDesignResult = {
  configPatch: Partial<StandConfig>;
  rationale: string;
  warnings: string[];
};

const aiDisabled =
  import.meta.env.VITE_DISABLE_AI === "true" || import.meta.env.VITE_DISABLE_RUNTIME === "true";

const toErrorMessage = async (res: Response) => {
  try {
    const data = await res.json();
    if (typeof data?.error === "string") return data.error;
  } catch {
    // ignore parse errors and fall back to status text
  }
  return res.statusText || "Request failed";
};

export async function requestAiDesign(
  config: StandConfig,
  locale?: string,
  instructions?: string
): Promise<AiDesignResult> {
  if (aiDisabled) {
    throw new Error("AI-API deaktiviert (VITE_DISABLE_AI/VITE_DISABLE_RUNTIME)");
  }

  const res = await fetch(`${apiBaseUrl}/api/ai/design`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config,
      locale,
      instructions: instructions?.trim() ? instructions.trim() : undefined,
    }),
  });

  if (!res.ok) {
    const msg = await toErrorMessage(res);
    throw new Error(msg);
  }

  const data = await res.json();
  return {
    configPatch: (data?.configPatch ?? {}) as Partial<StandConfig>,
    rationale: typeof data?.rationale === "string" ? data.rationale : "",
    warnings: Array.isArray(data?.warnings)
      ? data.warnings.filter((w: unknown): w is string => typeof w === "string")
      : [],
  };
}

export async function requestAiVoiceCommand(
  config: StandConfig,
  locale: string | undefined,
  instructions: string
): Promise<AiDesignResult> {
  if (aiDisabled) {
    throw new Error("AI-API deaktiviert (VITE_DISABLE_AI/VITE_DISABLE_RUNTIME)");
  }

  const res = await fetch(`${apiBaseUrl}/api/ai/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config,
      locale,
      instructions: instructions.trim(),
    }),
  });

  if (!res.ok) {
    const msg = await toErrorMessage(res);
    throw new Error(msg);
  }

  const data = await res.json();
  return {
    configPatch: (data?.configPatch ?? {}) as Partial<StandConfig>,
    rationale: typeof data?.rationale === "string" ? data.rationale : "",
    warnings: Array.isArray(data?.warnings)
      ? data.warnings.filter((w: unknown): w is string => typeof w === "string")
      : [],
  };
}
