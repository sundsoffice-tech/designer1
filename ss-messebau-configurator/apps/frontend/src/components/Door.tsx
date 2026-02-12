import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type DoorProps = {
  width?: number;
  height?: number;
  thickness?: number;
  open?: boolean;
  hinge?: "left" | "right";
  swingAngle?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  frameColor?: string;
  handleColor?: string;
};

export default function Door({
  width = 0.9,
  height = 2.1,
  thickness = 0.04,
  open = true,
  hinge = "right",
  swingAngle = THREE.MathUtils.degToRad(75),
  position,
  rotation,
  color = "#e2e8f0",
  frameColor = "#94a3b8",
  handleColor = "#0ea5e9",
}: DoorProps): JSX.Element {
  const hingeRef = useRef<THREE.Group>(null);
  const currentAngle = useRef(0);

  const hingeX = useMemo(() => (hinge === "left" ? -width / 2 : width / 2), [hinge, width]);
  const leafX = useMemo(() => (hinge === "left" ? width / 2 : -width / 2), [hinge, width]);
  const targetAngle = open ? (hinge === "left" ? -swingAngle : swingAngle) : 0;

  useFrame((_, delta) => {
    currentAngle.current = THREE.MathUtils.damp(currentAngle.current, targetAngle, 8, delta);
    if (hingeRef.current) {
      hingeRef.current.rotation.y = currentAngle.current;
    }
  });

  const handlePosition = useMemo<[number, number, number]>(
    () => [leafX * 0.6, 0, thickness / 2 + 0.01],
    [leafX, thickness]
  );

  return (
    <group position={position} rotation={rotation}>
      {/* frame */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.04, height + 0.04, thickness * 0.4]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} metalness={0.2} />
      </mesh>
      {/* door leaf with animated hinge */}
      <group ref={hingeRef} position={[hingeX, 0, 0]}>
        <mesh position={[leafX, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[width, height, thickness]} />
          <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
        </mesh>
        <mesh position={handlePosition} castShadow>
          <sphereGeometry args={[0.03, 10, 10]} />
          <meshStandardMaterial color={handleColor} emissive={handleColor} emissiveIntensity={0.6} />
        </mesh>
      </group>
    </group>
  );
}
