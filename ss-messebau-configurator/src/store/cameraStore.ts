import { create } from "zustand";

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
};

export type CameraView = {
  id: string;
  name: string;
  pose: CameraPose;
  createdAt: number;
};

export type CameraGuide = {
  id: string;
  name: string;
  description?: string;
  waypoints: CameraPose[];
};

export type CameraActionInput =
  | { type: "flyTo"; pose: CameraPose; duration?: number; reason?: string }
  | { type: "playGuide"; guideId: string; duration?: number };

type CameraAction = CameraActionInput & { id: number };

type CameraState = {
  currentPose: CameraPose | null;
  savedViews: CameraView[];
  guides: CameraGuide[];
  nextAction: CameraAction | null;
  setCurrentPose: (pose: CameraPose) => void;
  saveCurrentView: (name?: string) => CameraView | null;
  renameView: (id: string, name: string) => void;
  deleteView: (id: string) => void;
  loadView: (id: string) => void;
  queueAction: (action: CameraActionInput) => void;
  clearAction: (id: number) => void;
  setGuides: (guides: CameraGuide[]) => void;
};

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;

let actionCounter = 0;

export const useCameraStore = create<CameraState>((set, get) => ({
  currentPose: null,
  savedViews: [],
  guides: [],
  nextAction: null,
  setCurrentPose: (pose) => set({ currentPose: pose }),
  saveCurrentView: (name) => {
    const pose = get().currentPose;
    if (!pose) return null;
    const next: CameraView = {
      id: makeId("view"),
      name: name?.trim() && name.trim().length > 0 ? name.trim() : `Ansicht ${get().savedViews.length + 1}`,
      pose,
      createdAt: Date.now(),
    };
    set((state) => ({ savedViews: [...state.savedViews, next] }));
    return next;
  },
  renameView: (id, name) =>
    set((state) => ({
      savedViews: state.savedViews.map((view) => (view.id === id ? { ...view, name } : view)),
    })),
  deleteView: (id) => set((state) => ({ savedViews: state.savedViews.filter((view) => view.id !== id) })),
  loadView: (id) => {
    const view = get().savedViews.find((v) => v.id === id);
    if (!view) return;
    get().queueAction({ type: "flyTo", pose: view.pose });
  },
  queueAction: (action) =>
    set({
      nextAction: {
        ...action,
        id: ++actionCounter,
      } as CameraAction,
    }),
  clearAction: (id) =>
    set((state) => (state.nextAction && state.nextAction.id === id ? { nextAction: null } : state)),
  setGuides: (guides) => set({ guides }),
}));
