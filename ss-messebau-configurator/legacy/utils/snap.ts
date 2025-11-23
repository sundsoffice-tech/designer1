import type { Vector3 } from "three";

export const snapToGrid = (value: number, gridSize: number) =>
  Math.round(value / gridSize) * gridSize;

export const snapPosition2D = (
  position: { x: number; z: number },
  gridSize: number
): { x: number; z: number } => ({
  x: snapToGrid(position.x, gridSize),
  z: snapToGrid(position.z, gridSize),
});

export const snapVector3 = (vec: Vector3, gridSize: number) => {
  vec.set(snapToGrid(vec.x, gridSize), snapToGrid(vec.y, gridSize), snapToGrid(vec.z, gridSize));
  return vec;
};

