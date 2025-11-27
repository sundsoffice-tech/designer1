import type { ContextMenuItemConfig, ContextMenuPreset } from "../contextMenu/types";

export const contextMenuConfig = {
  enablePersonalizedGroups: true,
  frequentLimit: 4,
  foldMargin: 12,
  touchLongPressMs: 550,
  allowMenuDuringDrag: false,
};

const baseSelectionItems: ContextMenuItemConfig[] = [
  { commandId: "focusCamera", icon: "focus", group: "selection" },
  { commandId: "duplicate", icon: "duplicate", group: "selection" },
  { commandId: "delete", icon: "delete", group: "selection", destructive: true },
  { commandId: "resetTransform", icon: "reset", group: "selection" },
  { commandId: "snapToGrid", icon: "grid", group: "selection" },
  { commandId: "clearSelection", icon: "select", group: "selection" },
];

const screenItems: ContextMenuItemConfig[] = [
  { commandId: "focusCamera", icon: "focus", group: "object" },
  { commandId: "duplicate", icon: "duplicate", group: "object" },
  { commandId: "delete", icon: "delete", group: "object", destructive: true },
  { commandId: "changeScreenVideo", icon: "screen", group: "object" },
  { commandId: "changeMaterial", icon: "material", group: "object" },
  { commandId: "resetTransform", icon: "reset", group: "object" },
  { commandId: "snapToGrid", icon: "grid", group: "object" },
];

const counterItems: ContextMenuItemConfig[] = [
  { commandId: "focusCamera", icon: "focus", group: "object" },
  { commandId: "duplicate", icon: "duplicate", group: "object" },
  { commandId: "delete", icon: "delete", group: "object", destructive: true },
  { commandId: "changeMaterial", icon: "material", group: "object" },
  { commandId: "resetTransform", icon: "reset", group: "object" },
  { commandId: "alignToGrid", icon: "grid", group: "object" },
];

export const contextMenuPresets: ContextMenuPreset[] = [
  {
    id: "empty",
    selection: "none",
    items: [
      { commandId: "centerCameraHere", icon: "camera", group: "scene" },
      { commandId: "selectAll", icon: "select", group: "selection" },
      { commandId: "clearSelection", icon: "select", group: "selection" },
    ],
  },
  {
    id: "screen",
    objectTypes: ["screen"],
    selection: "single",
    items: screenItems,
  },
  {
    id: "counter",
    objectTypes: ["counter"],
    selection: "single",
    items: counterItems,
  },
  {
    id: "chair",
    objectTypes: ["chair"],
    selection: "single",
    items: baseSelectionItems,
  },
  {
    id: "cabin",
    objectTypes: ["cabin"],
    selection: "single",
    items: baseSelectionItems,
  },
  {
    id: "truss",
    objectTypes: ["truss"],
    selection: "single",
    items: baseSelectionItems,
  },
  {
    id: "selection",
    selection: "any",
    items: baseSelectionItems,
  },
];
