import { useMemo, type JSX } from "react";
import * as THREE from "three";
import WallSegment from "./WallSegment";
import Door from "./Door";
import type { WallMaterialConfig } from "./WallSegment";

export type CabinDoorSide = "front" | "back" | "left" | "right";

type CabinProps = {
  width: number;
  depth: number;
  height: number;
  position?: [number, number, number];
  floorHeight?: number;
  wallThickness?: number;
  wallMaterial?: WallMaterialConfig;
  roofMaterial?: THREE.MeshStandardMaterialParameters;
  withRoof?: boolean;
  doorPosition?: CabinDoorSide;
  doorWidth?: number;
  doorHeight?: number;
  doorBottom?: number;
  doorOpen?: boolean;
  doorHinge?: "left" | "right";
};

export default function Cabin({
  width,
  depth,
  height,
  position,
  floorHeight = 0,
  wallThickness = 0.05,
  wallMaterial,
  roofMaterial,
  withRoof = false,
  doorPosition = "front",
  doorWidth,
  doorHeight,
  doorBottom = 0,
  doorOpen = true,
  doorHinge = "right",
}: CabinProps): JSX.Element {
  const safeDoorHeight = Math.min(doorHeight ?? Math.max(2, height - 0.2), height - 0.05);
  const safeDoorWidth =
    doorWidth ??
    (doorPosition === "left" || doorPosition === "right"
      ? Math.min(0.9, depth - 0.2)
      : Math.min(0.9, width - 0.2));

  const opening = useMemo(
    () => ({
      width: safeDoorWidth,
      height: safeDoorHeight,
      bottom: Math.max(0, doorBottom),
      centerX: 0,
    }),
    [doorBottom, safeDoorHeight, safeDoorWidth]
  );

  const cabinPosition = useMemo<[number, number, number]>(
    () => position ?? [0, floorHeight + height / 2, 0],
    [floorHeight, height, position]
  );

  const roofArgs = useMemo<[number, number, number]>(
    () => [width, depth, Math.max(0.02, wallThickness * 0.8)],
    [depth, wallThickness, width]
  );

  const roofPosition: [number, number, number] = useMemo(
    () => [0, height / 2 + roofArgs[2] / 2, 0],
    [height, roofArgs]
  );

  const frontZ = depth / 2 - wallThickness / 2;
  const backZ = -frontZ;
  const leftX = -width / 2 + wallThickness / 2;
  const rightX = -leftX;

  const doorLocalY = -height / 2 + doorBottom + safeDoorHeight / 2;
  const doorOffset = useMemo(() => {
    switch (doorPosition) {
      case "front":
        return [0, doorLocalY, frontZ + wallThickness / 2] as [number, number, number];
      case "back":
        return [0, doorLocalY, backZ - wallThickness / 2] as [number, number, number];
      case "left":
        return [leftX - wallThickness / 2, doorLocalY, 0] as [number, number, number];
      case "right":
      default:
        return [rightX + wallThickness / 2, doorLocalY, 0] as [number, number, number];
    }
  }, [backZ, doorLocalY, doorPosition, frontZ, leftX, rightX, wallThickness]);

  const doorRotation = useMemo<[number, number, number]>(() => {
    switch (doorPosition) {
      case "front":
        return [0, 0, 0];
      case "back":
        return [0, Math.PI, 0];
      case "left":
        return [0, Math.PI / 2, 0];
      case "right":
      default:
        return [0, -Math.PI / 2, 0];
    }
  }, [doorPosition]);

  const openingsForSide = useMemo(() => [opening], [opening]);

  return (
    <group position={cabinPosition}>
      {/* front */}
      <WallSegment
        length={width}
        height={height}
        thickness={wallThickness}
        position={[0, 0, frontZ]}
        material={wallMaterial}
        openings={doorPosition === "front" ? openingsForSide : undefined}
      />
      {/* back */}
      <WallSegment
        length={width}
        height={height}
        thickness={wallThickness}
        position={[0, 0, backZ]}
        material={wallMaterial}
        openings={doorPosition === "back" ? openingsForSide : undefined}
      />
      {/* left */}
      <WallSegment
        length={depth}
        height={height}
        thickness={wallThickness}
        position={[leftX, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        material={wallMaterial}
        openings={doorPosition === "left" ? openingsForSide : undefined}
      />
      {/* right */}
      <WallSegment
        length={depth}
        height={height}
        thickness={wallThickness}
        position={[rightX, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        material={wallMaterial}
        openings={doorPosition === "right" ? openingsForSide : undefined}
      />

      <Door
        width={safeDoorWidth}
        height={safeDoorHeight}
        thickness={Math.max(0.03, wallThickness * 0.9)}
        position={doorOffset}
        rotation={doorRotation}
        open={doorOpen}
        hinge={doorHinge}
      />

      {withRoof && (
        <mesh position={roofPosition} castShadow receiveShadow>
          <boxGeometry args={roofArgs} />
          <meshStandardMaterial
            color={(roofMaterial?.color as string | undefined) ?? "#e2e8f0"}
            roughness={roofMaterial?.roughness ?? 0.85}
            metalness={roofMaterial?.metalness ?? 0.05}
          />
        </mesh>
      )}
    </group>
  );
}
