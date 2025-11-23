export type ProcessedImage = {
  url: string;
  mipmaps?: string[];
  width?: number;
  height?: number;
  size?: number;
  format?: string;
};

const ensureOk = async (res: Response) => {
  if (res.ok) return res;
  const message = await res.text();
  throw new Error(message || `Upload failed (${res.status})`);
};

export async function uploadBannerImage(file: File): Promise<ProcessedImage> {
  const form = new FormData();
  form.append("file", file);

  const res = await ensureOk(await fetch("/api/upload/banner", { method: "POST", body: form }));
  const data = (await res.json()) as ProcessedImage;

  if (!data?.url) {
    throw new Error("Upload response missing url");
  }

  return {
    url: data.url,
    mipmaps: Array.isArray(data.mipmaps) ? data.mipmaps : [],
    width: data.width,
    height: data.height,
    size: data.size,
    format: data.format ?? "webp",
  };
}
