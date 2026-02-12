export type TextureCategory = "wall" | "floor" | "banner" | "generic";
export type TextureFit = "stretch" | "cover";

export type TextureEntry = {
  id: string;
  name: string;
  url: string;
  category: TextureCategory;
  fit?: TextureFit;
  width?: number;
  height?: number;
  size?: number;
  uploadedAt?: number;
  fileName?: string;
  /** Optional Mipmaps fuer hochaufgeloeste Banner-Texturen */
  mipmaps?: string[];
  /** Optionaler KTX2-Pfad falls vorhanden */
  ktx2Url?: string;
  /** Format-Hinweis (z. B. webp, ktx2+webp) */
  format?: string;
};

export type TextureLibrary = TextureEntry[];

export const textureLibrary: TextureLibrary = [];
