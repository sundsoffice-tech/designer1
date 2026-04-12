import type { StandType, StandModules } from "./config.js";

export type LayoutPreset = {
  width: number;
  depth: number;
  height?: number;
  type?: StandType;
  modules: Partial<StandModules>;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const defaultCabin = (width: number, depth: number) => {
  const cabinW = 1.6;
  const cabinD = 1.4;
  const pos = {
    x: -width / 2 + cabinW / 2 + 0.4,
    z: -depth / 2 + cabinD / 2 + 0.4,
  };
  return { enabled: true, width: cabinW, depth: cabinD, height: 2.5, position: pos };
};

export const generateRectangleLayout = (width: number, depth: number, height = 3): LayoutPreset => {
  const frontZ = depth / 2 - 0.8;
  const backZ = -depth / 2 + 0.25;
  const leftX = -width / 2 + 0.7;
  const rightX = width / 2 - 0.7;
  return {
    width,
    depth,
    height,
    type: "row",
    modules: {
      truss: true,
      trussOffset: { x: 0, z: 0 },
      trussHeight: clamp(height + 1.5, height + 0.5, 6),
      countersDetailed: [
        { id: "ctr-front", variant: "premium", position: { x: 0, z: frontZ } },
        { id: "ctr-left", variant: "basic", position: { x: leftX, z: 0 }, rotationY: Math.PI / 2 },
        { id: "ctr-right", variant: "basic", position: { x: rightX, z: 0 }, rotationY: -Math.PI / 2 },
      ],
      detailedScreens: [
        { id: "scr-back", mount: "wall", wallSide: "back", position: { x: 0, z: backZ }, screenSize: "75" },
      ],
      chairsDetailed: [],
      cabin: undefined,
    },
  };
};

export const generateUShapeLayout = (width: number, depth: number, height = 3): LayoutPreset => {
  const backZ = -depth / 2 + 0.7;
  const frontZ = depth / 2 - 0.8;
  const leftX = -width / 2 + 0.7;
  const rightX = width / 2 - 0.7;
  return {
    width,
    depth,
    height,
    type: "row",
    modules: {
      truss: true,
      trussOffset: { x: 0, z: 0 },
      trussHeight: clamp(height + 1.5, height + 0.5, 6),
      countersDetailed: [
        { id: "ctr-back", variant: "premium", position: { x: 0, z: backZ } },
        { id: "ctr-left", variant: "basic", position: { x: leftX, z: 0 }, rotationY: Math.PI / 2 },
        { id: "ctr-right", variant: "basic", position: { x: rightX, z: 0 }, rotationY: -Math.PI / 2 },
        { id: "ctr-front", variant: "basic", position: { x: 0, z: frontZ } },
      ],
      detailedScreens: [
        { id: "scr-left", mount: "wall", wallSide: "left", position: { x: leftX, z: -0.1 }, screenSize: "65" },
        { id: "scr-right", mount: "wall", wallSide: "right", position: { x: rightX, z: -0.1 }, screenSize: "65" },
      ],
      chairsDetailed: [],
      cabin: undefined,
    },
  };
};

export const generateBridgeLayout = (width: number, depth: number, height = 3): LayoutPreset => {
  const frontZ = depth / 2 - 0.8;
  const midZ = 0;
  const leftX = -width / 2 + 0.9;
  const rightX = width / 2 - 0.9;
  return {
    width,
    depth,
    height,
    type: "row",
    modules: {
      truss: true,
      trussOffset: { x: 0, z: 0 },
      trussHeight: clamp(height + 1.5, height + 0.5, 6),
      countersDetailed: [
        { id: "ctr-bridge-left", variant: "premium", position: { x: leftX, z: midZ }, rotationY: Math.PI / 2 },
        { id: "ctr-bridge-right", variant: "premium", position: { x: rightX, z: midZ }, rotationY: -Math.PI / 2 },
        { id: "ctr-front", variant: "basic", position: { x: 0, z: frontZ } },
      ],
      detailedScreens: [
        { id: "scr-bridge", mount: "floor", position: { x: 0, z: midZ - 0.2 }, screenSize: "75" },
      ],
      chairsDetailed: [],
      cabin: undefined,
    },
  };
};

export const generateRearCabinLayout = (width: number, depth: number, height = 3): LayoutPreset => {
  const cabin = defaultCabin(width, depth);
  const screenX = Math.min(width / 2 - 0.6, cabin.position.x + cabin.width / 2 + 0.8);
  const screenZ = cabin.position.z - cabin.depth / 2 + 0.1;
  return {
    width,
    depth,
    height,
    type: "row",
    modules: {
      truss: false,
      countersDetailed: [
        { id: "ctr-front", variant: "basic", position: { x: 0, z: depth / 2 - 0.8 } },
      ],
      detailedScreens: [
        { id: "scr-cabin", mount: "wall", wallSide: "back", position: { x: screenX, z: screenZ }, screenSize: "65" },
      ],
      chairsDetailed: [],
      cabin,
    },
  };
};
