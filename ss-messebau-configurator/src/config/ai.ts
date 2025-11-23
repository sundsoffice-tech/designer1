type AiClientConfig = {
  baseUrl: string | null;
  apiKey: string | null;
  enabled: boolean;
  missing: string[];
};

const rawBase = (import.meta.env.VITE_AI_API_BASE || "").trim();
const rawKey = (import.meta.env.VITE_AI_API_KEY || "").trim();

const normalizedBase = rawBase ? rawBase.replace(/\/$/, "") : null;

export const aiClientConfig: AiClientConfig = {
  baseUrl: normalizedBase,
  apiKey: rawKey || null,
  enabled: Boolean(normalizedBase && rawKey),
  missing: [
    ...(normalizedBase ? [] : ["VITE_AI_API_BASE"]),
    ...(rawKey ? [] : ["VITE_AI_API_KEY"]),
  ],
};

export const aiHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (aiClientConfig.apiKey) {
    headers.Authorization = `Bearer ${aiClientConfig.apiKey}`;
  }
  return headers;
};

export const aiAssistantEnabled = import.meta.env.VITE_ENABLE_AI_ASSISTANT === "true";
export const voiceAssistantEnabled = import.meta.env.VITE_ENABLE_VOICE_ASSISTANT === "true";
