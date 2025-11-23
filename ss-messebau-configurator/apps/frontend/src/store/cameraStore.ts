import { create } from "zustand";

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
};

export type SavedView = {
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
  locked?: boolean;
};

type CameraActionInput =
  | { type: "flyTo"; pose: CameraPose; duration?: number; reason?: string }
  | { type: "playGuide"; guideId: string; duration?: number };

type CameraAction = CameraActionInput & { id: number };

type CameraState = {
  currentPose: CameraPose | null;
  savedViews: SavedView[];
  guides: CameraGuide[];
  nextAction: CameraAction | null;
  lodScale: number;
  setCurrentPose: (pose: CameraPose) => void;
  saveCurrentView: (name?: string) => SavedView | null;
  renameView: (id: string, name: string) => void;
  deleteView: (id: string) => void;
  loadView: (id: string) => void;
  queueAction: (action: CameraActionInput) => void;
  clearAction: (id: number) => void;
  setGuides: (guides: CameraGuide[]) => void;
  setLodScale: (value: number) => void;
  addGuide: (guide: CameraGuide) => CameraGuide;
  deleteGuide: (id: string) => void;
  createGuideFromViews: (name?: string, viewIds?: string[]) => CameraGuide | null;
};

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;

let actionCounter = 0;

export const useCameraStore = create<CameraState>((set, get) => ({
  currentPose: null,
  savedViews: [],
  guides: [],
  nextAction: null,
  lodScale: 1,
  setCurrentPose: (pose) => set({ currentPose: pose }),
  saveCurrentView: (name) => {
    const pose = get().currentPose;
    if (!pose) return null;
    const next: SavedView = {
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
  setLodScale: (value) => set({ lodScale: value }),
  setGuides: (guides) =>
    set((state) => {
      const customGuides = state.guides.filter((g) => !g.locked);
      const merged = [...guides];
      customGuides.forEach((cg) => {
        if (!merged.some((g) => g.id === cg.id)) merged.push(cg);
      });
      return { guides: merged };
    }),
  addGuide: (guide) => {
    const next: CameraGuide = {
      ...guide,
      id: guide.id ?? makeId("guide"),
      locked: guide.locked ?? false,
    };
    set((state) => ({
      guides: [...state.guides.filter((g) => g.id !== next.id), next],
    }));
    return next;
  },
  deleteGuide: (id) =>
    set((state) => ({
      guides: state.guides.filter((g) => (g.id === id && g.locked ? true : g.id !== id)),
    })),
  createGuideFromViews: (name, viewIds) => {
    const saved = get().savedViews;
    const selectedViews = (viewIds && viewIds.length > 0 ? viewIds : saved.map((v) => v.id))
      .map((id) => saved.find((v) => v.id === id))
      .filter(Boolean) as SavedView[];

    if (selectedViews.length < 2) return null;

    const guide: CameraGuide = {
      id: makeId("guide"),
      name: name?.trim() && name.trim().length > 0 ? name.trim() : `Tour ${get().guides.length + 1}`,
      description: `${selectedViews.length} Stops aus gespeicherten Ansichten`,
      waypoints: selectedViews.map((v) => v.pose),
      locked: false,
    };

    set((state) => ({ guides: [...state.guides, guide] }));
    return guide;
  },
}));
