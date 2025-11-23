import { AiClientError } from "../api/aiClient";

export const toErrorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof AiClientError) return err.message;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
};
