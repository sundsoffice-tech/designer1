import { Detailed } from "@react-three/drei";
import { useCallback, useLayoutEffect, useMemo, useRef, type JSX } from "react";
import * as THREE from "three";

type TraverseProps = {
  width: number;
  depth: number;
  height: number;
  frameThickness?: number;
  strutSpacing?: number;
  envMapIntensity?: number;
  lodDistances?: number[];
  materialize?: (base: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterialParameters;
};

type StrutSegment = { start: THREE.Vector3; end: THREE.Vector3 };

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Parametrische Traverse ohne Banner. Erzeugt ein einfaches Fachwerk aus
 * Streben und Verstrebungen anhand der uebergebenen Dimensionen.
 */
export default function Traverse({
  width,
  depth,
  height,
  frameThickness = 0.08,
  strutSpacing = 1,
  envMapIntensity = 1,
  lodDistances,
  materialize,
}: TraverseProps): JSX.Element {
  const distances = useMemo(() => {
    const values = lodDistances && lodDistances.length > 0 ? lodDistances : [8, 16];
    return [...values].sort((a, b) => a - b);
  }, [lodDistances]);

  const applyMaterial = useCallback(
    (base: THREE.MeshStandardMaterialParameters) => {
      const withEnv = base.envMapIntensity === undefined ? { ...base, envMapIntensity } : base;
      return materialize ? materialize(withEnv) : withEnv;
    },
    [envMapIntensity, materialize]
  );

  const topY = height;
  const chordSize = Math.max(0.04, frameThickness);
  const braceRadius = Math.max(0.0125, chordSize * 0.45);
  const spacing = Math.max(0.4, strutSpacing);
  const frameLengthX = Math.max(0.1, width);
  const frameLengthZ = Math.max(0.1, depth);

  const strutSegments = useMemo<StrutSegment[]>(() => {
    const xSegments = Math.max(1, Math.round(width / spacing));
    const zSegments = Math.max(1, Math.round(depth / spacing));
    const xStep = width / xSegments;
    const zStep = depth / zSegments;
    const segments: StrutSegment[] = [];

    for (let xi = 0; xi < xSegments; xi++) {
      for (let zi = 0; zi < zSegments; zi++) {
        const x0 = -width / 2 + xi * xStep;
        const x1 = x0 + xStep;
        const z0 = -depth / 2 + zi * zStep;
        const z1 = z0 + zStep;

        segments.push({
          start: new THREE.Vector3(x0, topY, z0),
          end: new THREE.Vector3(x1, topY, z1),
        });
        segments.push({
          start: new THREE.Vector3(x0, topY, z1),
          end: new THREE.Vector3(x1, topY, z0),
        });
      }
    }

    return segments;
  }, [depth, spacing, topY, width]);

  const strutRef = useRef<THREE.InstancedMesh | null>(null);
  useLayoutEffect(() => {
    const ref = strutRef.current;
    if (!ref) return;

    const temp = new THREE.Object3D();
    ref.count = strutSegments.length;
    strutSegments.forEach((segment, idx) => {
      const dir = new THREE.Vector3().subVectors(segment.end, segment.start);
      const length = dir.length();
      if (length <= 1e-4) return;

      const midpoint = new THREE.Vector3().addVectors(segment.start, segment.end).multiplyScalar(0.5);
      temp.position.copy(midpoint);
      temp.scale.set(1, length, 1);
      temp.quaternion.setFromUnitVectors(UP, dir.normalize());
      temp.updateMatrix();
      ref.setMatrixAt(idx, temp.matrix);
    });
    ref.instanceMatrix.needsUpdate = true;
  }, [strutSegments]);

  const frameHighDetail = useMemo(() => {
    return (
      <>
        <mesh position={[0, topY, depth / 2]} castShadow>
          <boxGeometry args={[frameLengthX, chordSize, chordSize]} />
          <meshStandardMaterial
            {...applyMaterial({ color: "#9ca3af", metalness: 0.8, roughness: 0.3 })}
          />
        </mesh>
        <mesh position={[0, topY, -depth / 2]} castShadow>
          <boxGeometry args={[frameLengthX, chordSize, chordSize]} />
          <meshStandardMaterial
            {...applyMaterial({ color: "#9ca3af", metalness: 0.8, roughness: 0.3 })}
          />
        </mesh>
        <mesh position={[-width / 2, topY, 0]} castShadow>
          <boxGeometry args={[chordSize, chordSize, frameLengthZ]} />
          <meshStandardMaterial
            {...applyMaterial({ color: "#9ca3af", metalness: 0.8, roughness: 0.3 })}
          />
        </mesh>
        <mesh position={[width / 2, topY, 0]} castShadow>
          <boxGeometry args={[chordSize, chordSize, frameLengthZ]} />
          <meshStandardMaterial
            {...applyMaterial({ color: "#9ca3af", metalness: 0.8, roughness: 0.3 })}
          />
        </mesh>
        {strutSegments.length > 0 && (
          <instancedMesh ref={strutRef} args={[undefined, undefined, strutSegments.length]} castShadow>
            <cylinderGeometry args={[braceRadius, braceRadius, 1, 10, 1, false]} />
            <meshStandardMaterial
              {...applyMaterial({ color: "#cbd5e1", metalness: 0.85, roughness: 0.35 })}
            />
          </instancedMesh>
        )}
      </>
    );
  }, [
    applyMaterial,
    braceRadius,
    chordSize,
    depth,
    frameLengthX,
    frameLengthZ,
    strutSegments.length,
    topY,
    width,
  ]);

  const frameMediumDetail = useMemo(() => {
    return (
      <mesh position={[0, topY, 0]} castShadow={false}>
        <boxGeometry args={[frameLengthX + chordSize * 0.75, chordSize * 1.15, frameLengthZ + chordSize * 0.75]} />
        <meshStandardMaterial
          {...applyMaterial({ color: "#a3a3a3", metalness: 0.65, roughness: 0.4 })}
        />
      </mesh>
    );
  }, [applyMaterial, chordSize, frameLengthX, frameLengthZ, topY]);

  const frameLowDetail = useMemo(() => {
    return (
      <mesh position={[0, topY, 0]} castShadow>
        <boxGeometry args={[frameLengthX + chordSize, chordSize * 1.25, frameLengthZ + chordSize]} />
        <meshStandardMaterial
          {...applyMaterial({
            color: "#9ca3af",
            metalness: 0.6,
            roughness: 0.35,
            envMapIntensity: envMapIntensity * 0.8,
          })}
        />
      </mesh>
    );
  }, [applyMaterial, chordSize, envMapIntensity, frameLengthX, frameLengthZ, topY]);

  return (
    <Detailed distances={distances}>
      <group>{frameHighDetail}</group>
      <group>{frameMediumDetail}</group>
      {frameLowDetail}
    </Detailed>
  );
}
