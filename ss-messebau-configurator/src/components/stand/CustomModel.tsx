import { Detailed, useGLTF } from "@react-three/drei";
import { invalidate } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { DEFAULT_LOD_DISTANCES } from "../../config/lod";

type CustomModelProps = {
  assetUrl: string;
  scale?: number;
};

const derivePreviewUrl = (url: string): string | null => {
  const match = url.match(/^(.*?)(\.[^.?#]+)(\?.*)?$/);
  if (!match) return null;
  const [, base, ext, query] = match;
  if (base.endsWith("-preview") || base.endsWith("-low")) return null;
  return `${base}-preview${ext}${query ?? ""}`;
};

const disposeScene = (scene: THREE.Object3D) => {
  scene.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose();
    if (Array.isArray(child.material)) child.material.forEach((m: THREE.Material) => m.dispose?.());
    else if (child.material) child.material.dispose?.();
  });
};

function ClonedScene({ url, scale = 1 }: { url: string; scale?: number }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useEffect(() => {
    scene.traverse((obj: any) => {
      if ("frustumCulled" in obj && typeof obj.frustumCulled === "boolean") obj.frustumCulled = true;
    });
    invalidate();
    return () => disposeScene(scene);
  }, [scene]);

  return <primitive object={scene} scale={scale} />;
}

const Placeholder = ({ scale = 1 }: { scale?: number }) => (
  <group scale={scale}>
    <mesh castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#94a3b8" roughness={0.6} metalness={0.12} />
    </mesh>
  </group>
);

export default function CustomModel({ assetUrl, scale = 1 }: CustomModelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    useGLTF.preload(assetUrl);
  }, [assetUrl]);

  useEffect(() => {
    let cancelled = false;
    const candidate = derivePreviewUrl(assetUrl);
    if (!candidate) {
      setPreviewUrl(null);
      return;
    }

    fetch(candidate, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setPreviewUrl(candidate);
          useGLTF.preload(candidate);
        } else {
          setPreviewUrl(null);
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [assetUrl]);

  const fallback = <Placeholder scale={scale} />;

  return (
    <Detailed distances={[...DEFAULT_LOD_DISTANCES]}>
      <Suspense fallback={fallback}>
        <ClonedScene url={assetUrl} scale={scale} />
      </Suspense>
      <Suspense fallback={fallback}>
        {previewUrl ? <ClonedScene url={previewUrl} scale={scale} /> : fallback}
      </Suspense>
      {fallback}
    </Detailed>
  );
}
