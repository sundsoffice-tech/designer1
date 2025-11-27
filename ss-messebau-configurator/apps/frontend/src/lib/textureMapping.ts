import * as THREE from "three";
import type { TextureFit } from "@ss/shared";

export const BLANK_TEXTURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAusB9YmqblsAAAAASUVORK5CYII=";

export const clampTextureFit = (fit?: TextureFit): TextureFit => (fit === "cover" ? "cover" : "stretch");

export function applyTextureFit(
  texture: THREE.Texture | null | undefined,
  meshWidth: number,
  meshHeight: number,
  fit: TextureFit,
  baseRepeat: [number, number] = [1, 1]
) {
  if (!texture) return;
  const texWidth = Number((texture.image as { width?: number } | undefined)?.width) || 1;
  const texHeight = Number((texture.image as { height?: number } | undefined)?.height) || 1;
  const meshAspect = meshWidth / (meshHeight || 1);
  const texAspect = texWidth / (texHeight || 1);

  const safeRepeat: [number, number] = [
    Math.max(0.0001, baseRepeat[0] ?? 1),
    Math.max(0.0001, baseRepeat[1] ?? 1),
  ];

  let repeatX = safeRepeat[0];
  let repeatY = safeRepeat[1];
  let offsetX = 0;
  let offsetY = 0;

  if (fit === "cover" && Number.isFinite(meshAspect) && Number.isFinite(texAspect) && meshAspect > 0 && texAspect > 0) {
    if (meshAspect > texAspect) {
      repeatY = repeatY * (texAspect / meshAspect);
    } else if (meshAspect < texAspect) {
      repeatX = repeatX * (meshAspect / texAspect);
    }
    offsetX = (1 - repeatX) / 2;
    offsetY = (1 - repeatY) / 2;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  } else {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }

  texture.repeat.set(repeatX, repeatY);
  texture.offset.set(offsetX, offsetY);
  texture.center.set(0.5, 0.5);
  texture.needsUpdate = true;
}
