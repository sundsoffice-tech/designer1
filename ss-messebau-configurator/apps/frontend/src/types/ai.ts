import type { StandConfig } from "../lib/pricing";
import type { ConfigPatch } from "../store/configStore";

export type StandConfigPatch = ConfigPatch;

export type AiUsage = Record<string, unknown>;

export type AiStandFromTextParams = {
  prompt: string;
  locale?: string;
  budget?: number;
};

export type AiMarketingCopyParams = {
  prompt: string;
  language?: string;
};

export type AiBannerImageParams = {
  prompt: string;
  size?: "1024x1024" | "1024x576";
};

export type AiDesignParams = {
  config: StandConfig;
  locale?: string;
  instructions?: string;
};

export type AiVoiceCommandParams = {
  config: StandConfig;
  locale?: string;
  instructions: string;
};

export type AiDesignResult = {
  configPatch: StandConfigPatch;
  rationale: string;
  warnings: string[];
  usage?: AiUsage;
};

export type AiVoiceCommandResult = AiDesignResult;

export type AiBannerImageResult = { imageUrl: string };

export type AiMarketingCopyResult = {
  headline: string;
  subline: string;
  body: string;
};

export type AiErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  detail?: unknown;
  details?: unknown;
  issues?: unknown;
};

export type ApiError = {
  status?: number;
  code?: string;
  details?: unknown;
  message: string;
};

export type AiConfigPatch = StandConfigPatch;

export type AiConfig = StandConfig;
