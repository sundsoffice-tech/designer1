export type StandConfigPatch = {
  width?: number;
  depth?: number;
  height?: number;
  type?: "row" | "corner" | "head" | "island";
  region?: string;
  rush?: boolean;
  modules?: Record<string, any>;
};

const API_BASE = import.meta.env.VITE_AI_API_BASE ?? "http://localhost:4000";

export async function aiStandFromText(input: {
  prompt: string;
  locale?: string;
  budget?: number;
}): Promise<StandConfigPatch> {
  const res = await fetch(`${API_BASE}/api/ai/stand-from-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("AI stand-from-text failed");
  const data = await res.json();
  return data.patch;
}

export async function aiMarketingCopy(input: {
  prompt: string;
  language?: string;
}) {
  const res = await fetch(`${API_BASE}/api/ai/marketing-copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("AI marketing-copy failed");
  return res.json() as Promise<{
    headline: string;
    subline: string;
    body: string;
  }>;
}

export async function aiBannerImage(input: {
  prompt: string;
  size?: "1024x1024" | "1024x576";
}) {
  const res = await fetch(`${API_BASE}/api/ai/banner-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("AI banner-image failed");
  return res.json() as Promise<{ imageUrl: string }>;
}
