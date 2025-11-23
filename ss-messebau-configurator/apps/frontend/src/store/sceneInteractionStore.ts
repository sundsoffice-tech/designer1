import { create } from "zustand";
import type { ContextMenuContext, InteractionMode, MenuPosition } from "../contextMenu/types";
import type { UserRole } from "../config/roles";
import { resolveRole } from "../config/roles";

type SceneInteractionState = {
  role: UserRole;
  mode: InteractionMode;
  selectionIds: string[];
  selectionType?: string;
  objectType?: string;
  collision?: boolean | "soft" | "hard";
  mousePosition?: MenuPosition;
  selectionCenter?: [number, number, number];
  setRole: (role: UserRole) => void;
  setMode: (mode: InteractionMode) => void;
  setSelection: (ids: string[], opts?: { selectionType?: string; objectType?: string }) => void;
  clearSelection: () => void;
  setCollision: (collision?: boolean | "soft" | "hard") => void;
  setMousePosition: (pos?: MenuPosition) => void;
  setSelectionCenter: (center?: [number, number, number]) => void;
  getContext: (overrides?: Partial<ContextMenuContext>) => ContextMenuContext;
};

export const useSceneInteractionStore = create<SceneInteractionState>((set, get) => ({
  role: "editor",
  mode: "edit",
  selectionIds: [],
  selectionType: undefined,
  objectType: undefined,
  collision: undefined,
  mousePosition: undefined,
  selectionCenter: undefined,
  setRole: (role) => set({ role }),
  setMode: (mode) => set({ mode }),
  setSelection: (ids, opts) =>
    set({
      selectionIds: ids,
      selectionType: opts?.selectionType,
      objectType: opts?.objectType ?? opts?.selectionType,
    }),
  clearSelection: () => set({ selectionIds: [], selectionType: undefined, objectType: undefined }),
  setCollision: (collision) => set({ collision }),
  setMousePosition: (mousePosition) => set({ mousePosition }),
  setSelectionCenter: (selectionCenter) => set({ selectionCenter }),
  getContext: (overrides) => {
    const state = get();
    return {
      objectId: state.selectionIds[0],
      objectType: state.objectType,
      selectionIds: state.selectionIds,
      selectionType: state.selectionType,
      selectionCount: state.selectionIds.length,
      mode: state.mode,
      role: resolveRole(state.role),
      collision: state.collision,
      mousePosition: state.mousePosition,
      selectionCenter: state.selectionCenter,
      ...overrides,
    };
  },
}));
