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
  mipmaps?: string[];
  ktx2Url?: string;
  format?: string;
};

export type TextureLibrary = TextureEntry[];

export const textureLibrary: TextureLibrary = [

];
