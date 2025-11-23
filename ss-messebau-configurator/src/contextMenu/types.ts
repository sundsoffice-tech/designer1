import type { CommandId } from "../store/commandTypes";
import type { UserRole } from "../config/roles";

export type ContextMenuIcon =
  | "duplicate"
  | "delete"
  | "focus"
  | "material"
  | "reset"
  | "grid"
  | "screen"
  | "select"
  | "settings"
  | "camera"
  | "warning"
  | "custom";

export type InteractionMode = "view" | "edit" | "place" | "inspect";

export type MenuPosition = { x: number; y: number };

export type CollisionState = "none" | "soft" | "hard";

export type ContextMenuContext = {
  objectId?: string;
  objectType?: string;
  selectionIds: string[];
  selectionType?: string;
  selectionCount?: number;
  mode: InteractionMode;
  role: UserRole;
  collision?: CollisionState | boolean;
  mousePosition?: MenuPosition;
  selectionCenter?: [number, number, number];
  isTouch?: boolean;
};

export type ContextMenuItem = {
  id: string;
  labelKey: string;
  commandId?: CommandId;
  icon?: ContextMenuIcon;
  group?: string;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  children?: ContextMenuItem[];
  separatorBefore?: boolean;
};

export type BuiltContextMenu = {
  items: ContextMenuItem[];
  context: ContextMenuContext;
};
