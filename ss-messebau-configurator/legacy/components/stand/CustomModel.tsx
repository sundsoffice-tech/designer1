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
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose?.());
    } else if (material) {
      material.dispose?.();
    }
  });
};

function ClonedScene({ url, scale = 1 }: { url: string; scale?: number }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useEffect(() => {
    scene.traverse((obj) => {
      obj.frustumCulled = true;
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

    const resolvePreview = async () => {
      if (!candidate) {
        setPreviewUrl(null);
        return;
      }

      try {
        const res = await fetch(candidate, { method: "HEAD" });
        if (!cancelled && res.ok) {
          setPreviewUrl(candidate);
          useGLTF.preload(candidate);
        } else if (!cancelled) {
          setPreviewUrl(null);
        }
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    };

    void resolvePreview();

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
