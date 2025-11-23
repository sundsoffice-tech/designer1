import { create } from "zustand";
import type { Camera, Scene, WebGLRenderer } from "three";

export type ThreeExportContext = {
  gl: WebGLRenderer;
  scene: Scene;
  camera: Camera;
};

type ExportState = {
  context: ThreeExportContext | null;
  setContext: (ctx: ThreeExportContext | null) => void;
};

export const useExportStore = create<ExportState>((set) => ({
  context: null,
  setContext: (ctx) => set({ context: ctx }),
}));
