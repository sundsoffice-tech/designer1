import { useMemo, type JSX } from "react";
import * as THREE from "three";
import type { Obb } from "../lib/collision";

type BoundingBoxOverlayProps = {
  boxes: Obb[];
  selectionIds: string[];
  collidingKeys: Set<string>;
  editMode: boolean;
};

type OverlayEntry = {
  id: string;
  parentId?: string;
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfDepth: number;
  rotationY: number;
  colliding: boolean;
};

export function BoundingBoxOverlay({
  boxes,
  selectionIds,
  collidingKeys,
  editMode,
}: BoundingBoxOverlayProps): JSX.Element | null {
  const overlays = useMemo<OverlayEntry[]>(() => {
    if (!editMode || selectionIds.length === 0) return [];
    const selectedSet = new Set(selectionIds);
    const entries: OverlayEntry[] = [];

    boxes.forEach((box) => {
      const isSelected = selectedSet.has(box.id) || (box.parentId && selectedSet.has(box.parentId));
      if (!isSelected) return;
      const parts = box.colliders?.length ? box.colliders : [box];
      parts.forEach((part) => {
        entries.push({
          id: part.id,
          parentId: part.parentId,
          centerX: part.centerX,
          centerZ: part.centerZ,
          halfWidth: part.halfWidth,
          halfDepth: part.halfDepth,
          rotationY: part.rotationY,
          colliding: collidingKeys.has(part.id) || (part.parentId ? collidingKeys.has(part.parentId) : false),
        });
      });
    });
    return entries;
  }, [boxes, collidingKeys, editMode, selectionIds]);

  if (!editMode || overlays.length === 0) return null;

  return (
    <group>
      {overlays.map((entry) => {
        const color = entry.colliding ? "#ef4444" : "#22d3ee";
        return (
          <group key={entry.id} position={[entry.centerX, 0.02, entry.centerZ]} rotation-y={entry.rotationY}>
            <mesh>
              <boxGeometry args={[entry.halfWidth * 2, 0.015, entry.halfDepth * 2]} />
              <meshStandardMaterial
                color={color}
                transparent
                opacity={entry.colliding ? 0.32 : 0.14}
                depthWrite={false}
              />
            </mesh>
            <mesh>
              <boxGeometry args={[entry.halfWidth * 2, 0.02, entry.halfDepth * 2]} />
              <meshBasicMaterial color={color} wireframe transparent opacity={0.8} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
