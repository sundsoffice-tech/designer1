import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from "react";
import * as THREE from "three";
import { type GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type TrussLayout, type TrussSegment, buildAttachmentPoints } from "@ss/shared";
import { DEFAULT_TRUSS_PROFILE } from "../lib/trussLayout";

type TrussSystemProps = {
  layout: TrussLayout | null;
  /** Optional GLTF URL for a single straight segment (aligned on +X). */
  segmentUrl?: string;
  /** Force a specific profile id; otherwise the first profile in the layout is used. */
  profileId?: string;
  color?: string;
  showAttachmentHelpers?: boolean;
};

const X_AXIS = new THREE.Vector3(1, 0, 0);

const findFirstMesh = (gltf: GLTF | null): THREE.Mesh | null => {
  if (!gltf?.scene) return null;
  let found: THREE.Mesh | null = null;
  gltf.scene.traverse((obj) => {
    if (found) return;
    if ((obj as THREE.Mesh).isMesh) {
      found = obj as THREE.Mesh;
    }
  });
  return found;
};

const resolveMaterial = (mesh: THREE.Mesh | null, color?: string): THREE.MeshStandardMaterial => {
  const source = mesh?.material;
  if (Array.isArray(source)) {
    return new THREE.MeshStandardMaterial({ color: color ?? "#d1d5db", metalness: 0.65, roughness: 0.35 });
  }
  if (source instanceof THREE.MeshStandardMaterial) return source.clone();
  if (source instanceof THREE.Material) {
    const mat = new THREE.MeshStandardMaterial();
    mat.copy(source);
    if (color) mat.color = new THREE.Color(color);
    return mat;
  }
  return new THREE.MeshStandardMaterial({ color: color ?? "#d1d5db", metalness: 0.65, roughness: 0.35 });
};

const resolveGeometry = (
  mesh: THREE.Mesh | null,
  fallbackLength: number,
  fallbackCrossSection: number
): THREE.BufferGeometry => {
  if (mesh?.geometry) return mesh.geometry.clone();
  return new THREE.BoxGeometry(fallbackLength, fallbackCrossSection, fallbackCrossSection);
};

const matrixForSegment = (
  target: THREE.Object3D,
  segment: TrussSegment,
  profileLength: number
): THREE.Matrix4 | null => {
  const from = new THREE.Vector3(segment.from.x, segment.from.y, segment.from.z);
  const to = new THREE.Vector3(segment.to.x, segment.to.y, segment.to.z);
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  if (length < 1e-4) return null;

  const midpoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const rotation = new THREE.Quaternion().setFromUnitVectors(X_AXIS, dir.normalize());
  const scaleX = length / (profileLength || 1);

  target.position.copy(midpoint);
  target.quaternion.copy(rotation);
  target.scale.set(scaleX, 1, 1);
  target.updateMatrix();
  return target.matrix.clone();
};

const useGltfSegment = (segmentUrl?: string) => {
  const [gltf, setGltf] = useState<GLTF | null>(null);

  useEffect(() => {
    if (!segmentUrl) {
      setGltf(null);
      return;
    }
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      segmentUrl,
      (data) => {
        if (!cancelled) setGltf(data);
      },
      undefined,
      () => {
        if (!cancelled) setGltf(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [segmentUrl]);

  return gltf;
};

export function TrussSystem({
  layout,
  segmentUrl,
  profileId,
  color,
  showAttachmentHelpers = false,
}: TrussSystemProps): JSX.Element | null {
  const instancedRef = useRef<THREE.InstancedMesh | null>(null);
  const gltf = useGltfSegment(segmentUrl);
  const gltfMesh = useMemo(() => findFirstMesh(gltf), [gltf]);

  const profileLookup = layout?.profiles ?? {};
  const firstProfile =
    (profileId && profileLookup[profileId]) ||
    (layout?.segments.length ? profileLookup[layout.segments[0]?.profileId] : undefined) ||
    DEFAULT_TRUSS_PROFILE;
  const profileLength = firstProfile?.length ?? DEFAULT_TRUSS_PROFILE.length;
  const crossSection = firstProfile?.crossSection ?? DEFAULT_TRUSS_PROFILE.crossSection;

  const geometry = useMemo(
    () => resolveGeometry(gltfMesh, profileLength, crossSection),
    [gltfMesh, profileLength, crossSection]
  );
  const material = useMemo(() => resolveMaterial(gltfMesh, color), [gltfMesh, color]);

  useLayoutEffect(() => {
    const ref = instancedRef.current;
    if (!ref || !layout) return;
    const temp = new THREE.Object3D();
    ref.count = layout.segments.length;
    layout.segments.forEach((segment, idx) => {
      const profile = profileLookup[segment.profileId] ?? firstProfile;
      const matrix = matrixForSegment(temp, segment, profile?.length ?? profileLength);
      if (!matrix) return;
      ref.setMatrixAt(idx, matrix);
    });
    ref.instanceMatrix.needsUpdate = true;
  }, [firstProfile, layout, profileLength, profileLookup]);

  const attachments = useMemo(
    () =>
      showAttachmentHelpers && layout
        ? layout.attachments ?? buildAttachmentPoints(layout, layout.gridSnap)
        : [],
    [layout, showAttachmentHelpers]
  );

  if (!layout || layout.segments.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={instancedRef}
        args={[geometry, material, layout.segments.length]}
        castShadow
        receiveShadow
      />
      {attachments.map((att) => (
        <mesh key={att.id} position={[att.position.x, att.position.y, att.position.z]} castShadow={false}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

export default TrussSystem;
