import { create } from "zustand";
import type { BuiltContextMenu, ContextMenuContext, ContextMenuItem, MenuPosition } from "./types";

type ContextMenuState = {
  isOpen: boolean;
  position: MenuPosition;
  items: ContextMenuItem[];
  context: ContextMenuContext | null;
  highlightedId: string | null;
  openMenu: (payload: BuiltContextMenu | { position: MenuPosition; items: ContextMenuItem[]; context: ContextMenuContext }) => void;
  closeMenu: () => void;
  setHighlighted: (id: string | null) => void;
};

const DEFAULT_POS: MenuPosition = { x: 0, y: 0 };

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  isOpen: false,
  position: DEFAULT_POS,
  items: [],
  context: null,
  highlightedId: null,
  openMenu: (payload) => {
    const position = "position" in payload ? payload.position : DEFAULT_POS;
    const { items, context } = payload;
    set({
      isOpen: true,
      position: position ?? DEFAULT_POS,
      items: items.filter((item) => !item.hidden),
      context,
      highlightedId: null,
    });
  },
  closeMenu: () =>
    set({
      isOpen: false,
      items: [],
      context: null,
      highlightedId: null,
      position: DEFAULT_POS,
    }),
  setHighlighted: (id) => set({ highlightedId: id }),
}));
