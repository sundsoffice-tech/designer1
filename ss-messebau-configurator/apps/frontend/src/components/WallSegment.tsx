import { useEffect, useMemo, type JSX } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { TextureFit } from "@ss/shared";
import { applyTextureFit, BLANK_TEXTURE, clampTextureFit } from "../lib/textureMapping";

type MaterialPreset = "system" | "hpl" | "fabric" | "lightbox";

export type WallMaterialConfig = THREE.MeshStandardMaterialParameters & {
  preset?: MaterialPreset;
  textureUrl?: string;
  textureRepeat?: [number, number];
  textureFit?: TextureFit;
};

type WallOpening = {
  width: number;
  height: number;
  bottom?: number;
  centerX?: number;
};

type SnapPoint = {
  id?: string;
  position?: [number, number, number];
  side?: "front" | "back" | "both";
  size?: number;
  color?: string;
};

type WallSegmentProps = {
  length: number;
  height: number;
  thickness?: number;
  segmentWidth?: number;
  segmentGap?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  floorHeight?: number;
  material?: WallMaterialConfig;
  texture?: string | THREE.Texture;
  textureRepeat?: [number, number];
  textureFit?: TextureFit;
  snapPoints?: SnapPoint[];
  showSnapHelpers?: boolean;
  snapPointSize?: number;
  snapPointColor?: string;
  openings?: WallOpening[];
  castShadow?: boolean;
  receiveShadow?: boolean;
};

const MATERIAL_PRESETS: Record<MaterialPreset, THREE.MeshStandardMaterialParameters> = {
  system: { color: "#e5e7eb", roughness: 0.85, metalness: 0.08 },
  hpl: { color: "#d6d3d1", roughness: 0.38, metalness: 0.1 },
  fabric: { color: "#cbd5e1", roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide },
  lightbox: {
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 1.1,
    roughness: 0.35,
    metalness: 0.05,
    side: THREE.DoubleSide,
  },
};

export default function WallSegment({
  length,
  height,
  thickness = 0.08,
  segmentWidth = 1,
  segmentGap = 0,
  position,
  rotation,
  floorHeight = 0,
  material,
  texture,
  textureRepeat,
  textureFit,
  snapPoints,
  showSnapHelpers = true,
  snapPointSize,
  snapPointColor,
  openings,
  castShadow = true,
  receiveShadow = true,
}: WallSegmentProps): JSX.Element {
  const safeLength = Math.max(length, 0.01);
  const baseSegmentWidth = Math.max(segmentWidth, 0.05);
  const gap = Math.max(segmentGap, 0);
  const segmentCount = Math.max(1, Math.ceil(safeLength / baseSegmentWidth));
  const usableLength = Math.max(safeLength - gap * (segmentCount - 1), 0.01);
  const unitWidth = usableLength / segmentCount;

  type SegmentPiece = { key: string; x: number; width: number; height: number; y: number };

  const pieces = useMemo<SegmentPiece[]>(() => {
    if (!openings || openings.length === 0) {
      let cursor = -safeLength / 2;
      return Array.from({ length: segmentCount }, (_, idx) => {
        const width = unitWidth;
        const centerX = cursor + width / 2;
        cursor += width + gap;
        return { width, x: centerX, key: `seg-${idx}`, height, y: 0 };
      });
    }

    const sorted = [...openings].sort((a, b) => (a.centerX ?? 0) - (b.centerX ?? 0));
    const solids: SegmentPiece[] = [];
    const startX = -safeLength / 2;
    const endX = safeLength / 2;
    let cursor = startX;

    sorted.forEach((opening, idx) => {
      const width = Math.max(0, Math.min(opening.width, safeLength));
      const center = opening.centerX ?? 0;
      const oStart = Math.max(startX, Math.min(center - width / 2, endX));
      const oEnd = Math.min(endX, oStart + width);

      const preWidth = oStart - cursor;
      if (preWidth > 0.01) {
        solids.push({
          key: `pre-${idx}`,
          x: cursor + preWidth / 2,
          width: preWidth,
          height,
          y: 0,
        });
      }

      const bottom = Math.max(0, opening.bottom ?? 0);
      if (bottom > 0.005) {
        solids.push({
          key: `bottom-${idx}`,
          x: oStart + width / 2,
          width,
          height: bottom,
          y: -height / 2 + bottom / 2,
        });
      }

      const headerHeight = height - bottom - opening.height;
      if (headerHeight > 0.01) {
        solids.push({
          key: `header-${idx}`,
          x: oStart + width / 2,
          width,
          height: headerHeight,
          y: -height / 2 + bottom + opening.height + headerHeight / 2,
        });
      }
      cursor = oEnd;
    });

    const trailingWidth = endX - cursor;
    if (trailingWidth > 0.01) {
      solids.push({
        key: `post-${sorted.length}`,
        x: cursor + trailingWidth / 2,
        width: trailingWidth,
        height,
        y: 0,
      });
    }

    return solids;
  }, [gap, height, openings, safeLength, segmentCount, unitWidth]);

  const wallPosition = useMemo<[number, number, number]>(
    () => position ?? [0, floorHeight + height / 2, 0],
    [floorHeight, height, position]
  );

  const requestedTextureUrl = useMemo(
    () => (typeof texture === "string" && texture.length > 0 ? texture : material?.textureUrl),
    [material?.textureUrl, texture]
  );
  const textureToLoad = requestedTextureUrl ?? BLANK_TEXTURE;
  useEffect(() => {
    if (!requestedTextureUrl) return;
    try {
      useTexture.preload(requestedTextureUrl);
    } catch {
      // preload best effort only
    }
  }, [requestedTextureUrl]);
  const loadedTexture = useTexture(textureToLoad) as THREE.Texture;

  const resolvedTexture = useMemo(() => {
    if (material?.map instanceof THREE.Texture) return material.map;
    if (texture instanceof THREE.Texture) return texture;
    if (requestedTextureUrl) return loadedTexture;
    return undefined;
  }, [loadedTexture, material?.map, requestedTextureUrl, texture]);

  const repeat = material?.textureRepeat ?? textureRepeat ?? [1, 1];
  const fitMode = clampTextureFit(material?.textureFit ?? textureFit);

  useEffect(() => {
    if (!resolvedTexture) return;
    applyTextureFit(resolvedTexture, safeLength, height, fitMode, repeat);
  }, [fitMode, height, repeat, resolvedTexture, safeLength]);

  const materialProps = useMemo(() => {
    const { preset = "system", textureUrl: _tu, textureRepeat: _tr, map: mapOverride, ...rest } = material ?? {};
    const presetProps = MATERIAL_PRESETS[preset] ?? MATERIAL_PRESETS.system;
    const base: THREE.MeshStandardMaterialParameters = {
      ...presetProps,
      ...rest,
    };
    if (mapOverride instanceof THREE.Texture) {
      base.map = mapOverride;
    } else if (resolvedTexture && base.map === undefined) {
      base.map = resolvedTexture;
    }
    return base;
  }, [material, resolvedTexture]);

  const defaultSnapPoints = useMemo(() => {
    if (snapPoints?.length) return snapPoints;
    const frontZ = thickness / 2 + 0.01;
    const generated: SnapPoint[] = [];

    pieces.forEach((piece, idx) => {
      if (piece.height < 0.2 || piece.width < 0.05) return;
      const lowerLocal =
        piece.y - piece.height / 2 + Math.min(piece.height - 0.05, Math.max(0.15, piece.height * 0.45));
      const upperLocal =
        piece.y - piece.height / 2 + Math.min(piece.height - 0.05, Math.max(lowerLocal + 0.05, piece.height * 0.75));
      const baseId = `snap-${idx}`;
      generated.push({ id: `${baseId}-lower`, position: [piece.x, lowerLocal, frontZ] });
      generated.push({ id: `${baseId}-upper`, position: [piece.x, upperLocal, frontZ] });
    });
    return generated;
  }, [pieces, snapPoints, thickness]);

  const snapHelpers = showSnapHelpers ? defaultSnapPoints : [];

  return (
    <group position={wallPosition} rotation={rotation}>
      {pieces.map((segment) => (
        <mesh
          key={`wall-segment-${segment.key}`}
          position={[segment.x, segment.y, 0]}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        >
          <boxGeometry args={[segment.width, segment.height, thickness]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      ))}
      {snapHelpers.flatMap((point, idx) => {
        const { position: snapPos = [0, 0, thickness / 2], side = "front", size, color, id } = point;
        const targets =
          side === "both"
            ? [snapPos, [snapPos[0], snapPos[1], -snapPos[2]] as [number, number, number]]
            : side === "back"
            ? ([[snapPos[0], snapPos[1], -snapPos[2]] as [number, number, number]] as [number, number, number][])
            : [snapPos];
        return targets.map((pos, posIdx) => (
          <mesh key={`${id ?? `snap-${idx}`}-${posIdx}`} position={pos}>
            <sphereGeometry args={[size ?? snapPointSize ?? 0.04, 12, 12]} />
            <meshStandardMaterial
              color={color ?? snapPointColor ?? "#38bdf8"}
              emissive={color ?? snapPointColor ?? "#38bdf8"}
              emissiveIntensity={0.5}
              toneMapped={false}
            />
          </mesh>
        ));
      })}
    </group>
  );
}
