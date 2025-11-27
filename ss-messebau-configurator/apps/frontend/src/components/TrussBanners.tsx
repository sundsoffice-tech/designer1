import { useEffect, useMemo, type JSX, type ReactNode } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

type TrussBannersProps = {
  width: number;
  depth: number;
  trussHeight: number;
  bannerWidth: number;
  bannerHeight: number;
  bannerThickness: number;
  bannersFront: number;
  bannersBack: number;
  bannersLeft: number;
  bannersRight: number;
  bannerImageUrl?: string;
  bannerWebpUrl?: string;
  bannerMipmaps?: string[];
  bannerKtx2Url?: string;
  blankFallback: string;
};

export default function TrussBanners({
  width,
  depth,
  trussHeight,
  bannerWidth,
  bannerHeight,
  bannerThickness,
  bannersFront,
  bannersBack,
  bannersLeft,
  bannersRight,
  bannerImageUrl,
  bannerWebpUrl,
  bannerMipmaps = [],
  blankFallback,
}: TrussBannersProps): JSX.Element | null {
  const hasAnyBanner = bannersFront + bannersBack + bannersLeft + bannersRight > 0;
  const mipmapUrls = useMemo(() => bannerMipmaps.filter(Boolean), [bannerMipmaps]);
  const primaryTextureUrl = useMemo(
    () => bannerWebpUrl ?? bannerImageUrl ?? mipmapUrls[0] ?? blankFallback,
    [bannerImageUrl, bannerWebpUrl, blankFallback, mipmapUrls]
  );
  useEffect(() => {
    if (primaryTextureUrl) {
      try {
        useTexture.preload(primaryTextureUrl);
      } catch {
        // ignore preload issues
      }
    }
    mipmapUrls.forEach((url) => {
      try {
        useTexture.preload(url);
      } catch {
        // ignore
      }
    });
  }, [mipmapUrls, primaryTextureUrl]);
  const baseBannerTexture = useTexture(primaryTextureUrl) as THREE.Texture;
  const mipmapTextures = useTexture(mipmapUrls) as THREE.Texture[];
  const bannerTexture = useMemo(() => {
    if (!baseBannerTexture) return baseBannerTexture;
    const cloned = baseBannerTexture.clone();
    if (mipmapTextures.length > 0) {
      cloned.mipmaps = mipmapTextures.map((tex) => tex.image) as THREE.Texture["mipmaps"];
      cloned.generateMipmaps = false;
    } else {
      cloned.generateMipmaps = true;
    }
    cloned.needsUpdate = true;
    return cloned;
  }, [baseBannerTexture, mipmapTextures]);

  const materialProps = useMemo<THREE.MeshStandardMaterialParameters>(
    () =>
      bannerTexture
        ? { map: bannerTexture }
    : ({ color: "#111827", roughness: 0.5, metalness: 0.2 } as const),
    [bannerTexture]
  );

  const anchorY = trussHeight - bannerHeight / 2;
  const sideOffset = bannerThickness / 2 + 0.04;

  const banners = useMemo(() => {
    if (!hasAnyBanner) return [];
    const nodes: ReactNode[] = [];

    if (bannersFront > 0) {
      Array.from({ length: bannersFront }).forEach((_, i) => {
        const spacing = width / (bannersFront + 1);
        const x = -width / 2 + spacing * (i + 1);
        const z = depth / 2 - sideOffset;
        nodes.push(
          <mesh key={`banner-front-${i}`} position={[x, anchorY, z]} castShadow>
            <boxGeometry args={[bannerWidth, bannerHeight, bannerThickness]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
        );
      });
    }

    if (bannersBack > 0) {
      Array.from({ length: bannersBack }).forEach((_, i) => {
        const spacing = width / (bannersBack + 1);
        const x = -width / 2 + spacing * (i + 1);
        const z = -depth / 2 + sideOffset;
        nodes.push(
          <mesh key={`banner-back-${i}`} position={[x, anchorY, z]} castShadow>
            <boxGeometry args={[bannerWidth, bannerHeight, bannerThickness]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
        );
      });
    }

    if (bannersLeft > 0) {
      Array.from({ length: bannersLeft }).forEach((_, i) => {
        const spacing = depth / (bannersLeft + 1);
        const z = -depth / 2 + spacing * (i + 1);
        const x = -width / 2 + sideOffset;
        nodes.push(
          <mesh key={`banner-left-${i}`} position={[x, anchorY, z]} rotation-y={Math.PI / 2} castShadow>
            <boxGeometry args={[bannerWidth, bannerHeight, bannerThickness]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
        );
      });
    }

    if (bannersRight > 0) {
      Array.from({ length: bannersRight }).forEach((_, i) => {
        const spacing = depth / (bannersRight + 1);
        const z = -depth / 2 + spacing * (i + 1);
        const x = width / 2 - sideOffset;
        nodes.push(
          <mesh key={`banner-right-${i}`} position={[x, anchorY, z]} rotation-y={-Math.PI / 2} castShadow>
            <boxGeometry args={[bannerWidth, bannerHeight, bannerThickness]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
        );
      });
    }

    return nodes;
  }, [
    bannerHeight,
    bannerThickness,
    bannerWidth,
    bannersBack,
    bannersFront,
    bannersLeft,
    bannersRight,
    anchorY,
    depth,
    hasAnyBanner,
    materialProps,
    sideOffset,
    width,
  ]);

  if (!hasAnyBanner) return null;

  return <>{banners}</>;
}
