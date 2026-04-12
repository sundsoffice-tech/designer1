import { useConfigStore } from "./configStore";
import { useCameraStore } from "./cameraStore";
import type { UserRole } from "../config/roles";
import { canExecuteCommandForRole, resolveRole } from "../config/roles";
import { recordCommandUsage } from "../contextMenu/analytics";
import type { CommandId } from "./commandTypes";
export type { CommandId } from "./commandTypes";

export type CommandContext = {
  objectId?: string;
  objectType?: string;
  selectionIds?: string[];
  selectionType?: string;
  selectionCount?: number;
  mousePosition?: { x: number; y: number };
  selectionCenter?: [number, number, number];
  role?: UserRole;
  mode?: string;
  collision?: boolean | "none" | "soft" | "hard";
  extras?: Record<string, unknown>;
};

export type CommandResult =
  | { status: "ok"; message?: string }
  | { status: "noop"; message?: string }
  | { status: "error"; message?: string };

type CommandDefinition = {
  id: CommandId;
  labelKey: string;
  descriptionKey?: string;
  requiresSelection?: boolean;
  minSelection?: number;
  allowedRoles?: UserRole[];
  visible?: (ctx: CommandContext) => boolean;
  disabled?: (ctx: CommandContext) => boolean;
  perform: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
};

type SceneCommandAdapter = {
  duplicateSelection?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  deleteSelection?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  changeMaterial?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  resetTransform?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  snapToGrid?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  alignToGrid?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  alignLineX?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  alignLineZ?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  alignToBackWall?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  changeScreenVideo?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  selectAll?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  clearSelection?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  centerCamera?: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
};

let sceneCommandAdapter: SceneCommandAdapter = {};

export const registerSceneCommandAdapter = (adapter: SceneCommandAdapter) => {
  sceneCommandAdapter = { ...sceneCommandAdapter, ...adapter };
};

const guardSelection = (ctx: CommandContext): CommandResult | null => {
  const count = ctx.selectionCount ?? ctx.selectionIds?.length ?? 0;
  if (count <= 0) {
    return { status: "noop", message: "selection_missing" };
  }
  return null;
};

const definitions: Record<CommandId, CommandDefinition> = {
  duplicate: {
    id: "duplicate",
    labelKey: "contextMenu.duplicate",
    requiresSelection: true,
    perform: (ctx) => sceneCommandAdapter.duplicateSelection?.(ctx) ?? { status: "noop", message: "unavailable" },
  },
  delete: {
    id: "delete",
    labelKey: "contextMenu.delete",
    requiresSelection: true,
    perform: (ctx) => sceneCommandAdapter.deleteSelection?.(ctx) ?? { status: "noop", message: "unavailable" },
  },
  focusCamera: {
    id: "focusCamera",
    labelKey: "contextMenu.focusCamera",
    perform: (ctx) => {
      if (sceneCommandAdapter.centerCamera) return sceneCommandAdapter.centerCamera(ctx);
      const focus = ctx.selectionCenter;
      if (!focus) return { status: "noop", message: "missing_target" };
      const queue = useCameraStore.getState().queueAction;
      queue({
        type: "flyTo",
        pose: { target: focus, position: [focus[0] + 3, focus[1] + 1.2, focus[2] + 3] },
        duration: 0.6,
        reason: "focus",
      });
      return { status: "ok" };
    },
  },
  focusHere: {
    id: "focusHere",
    labelKey: "contextMenu.focusHere",
    perform: (ctx) => {
      if (sceneCommandAdapter.centerCamera) return sceneCommandAdapter.centerCamera(ctx);
      if (!ctx.selectionCenter) return { status: "noop", message: "missing_target" };
      const queue = useCameraStore.getState().queueAction;
      queue({
        type: "flyTo",
        pose: { target: ctx.selectionCenter, position: [ctx.selectionCenter[0] + 2.4, ctx.selectionCenter[1] + 1, ctx.selectionCenter[2] + 2.4] },
        duration: 0.5,
        reason: "focus",
      });
      return { status: "ok" };
    },
  },
  changeMaterial: {
    id: "changeMaterial",
    labelKey: "contextMenu.changeMaterial",
    requiresSelection: true,
    perform: (ctx) => sceneCommandAdapter.changeMaterial?.(ctx) ?? { status: "noop", message: "unavailable" },
  },
  resetTransform: {
    id: "resetTransform",
    labelKey: "contextMenu.resetTransform",
    requiresSelection: true,
    perform: (ctx) => sceneCommandAdapter.resetTransform?.(ctx) ?? { status: "noop", message: "unavailable" },
  },
  snapToGrid: {
    id: "snapToGrid",
    labelKey: "contextMenu.snapToGrid",
    requiresSelection: true,
    perform: (ctx) => sceneCommandAdapter.snapToGrid?.(ctx) ?? { status: "noop", message: "unavailable" },
  },
  changeScreenVideo: {
    id: "changeScreenVideo",
    labelKey: "contextMenu.changeScreenVideo",
    requiresSelection: true,
    perform: (ctx) => sceneCommandAdapter.changeScreenVideo?.(ctx) ?? { status: "noop", message: "unavailable" },
  },
  selectAll: {
    id: "selectAll",
    labelKey: "contextMenu.selectAll",
    perform: (ctx) => sceneCommandAdapter.selectAll?.(ctx) ?? { status: "noop", message: "unavailable" },
  },
  clearSelection: {
    id: "clearSelection",
    labelKey: "contextMenu.clearSelection",
    perform: (ctx) => sceneCommandAdapter.clearSelection?.(ctx) ?? { status: "noop", message: "unavailable" },
  },
  undo: {
    id: "undo",
    labelKey: "contextMenu.undo",
    perform: () => {
      const ok = useConfigStore.getState().undo();
      return ok ? { status: "ok" } : { status: "noop", message: "history_empty" };
    },
  },
  redo: {
    id: "redo",
    labelKey: "contextMenu.redo",
    perform: () => {
      const ok = useConfigStore.getState().redo();
      return ok ? { status: "ok" } : { status: "noop", message: "history_empty" };
    },
  },
  centerCameraHere: {
    id: "centerCameraHere",
    labelKey: "contextMenu.centerCameraHere",
    perform: (ctx) => {
      const focus = ctx.selectionCenter;
      if (!focus) return { status: "noop", message: "missing_target" };
      const queue = useCameraStore.getState().queueAction;
      queue({
        type: "flyTo",
        pose: { target: focus, position: [focus[0] + 2, focus[1] + 1, focus[2] + 2] },
        duration: 0.6,
        reason: "focus",
      });
      return { status: "ok" };
    },
  },
  alignToGrid: {
    id: "alignToGrid",
    labelKey: "contextMenu.alignToGrid",
    requiresSelection: true,
    perform: (ctx) => sceneCommandAdapter.snapToGrid?.(ctx) ?? { status: "noop", message: "unavailable" },
  },
  toggleCollisionLock: {
    id: "toggleCollisionLock",
    labelKey: "contextMenu.toggleCollision",
    requiresSelection: true,
    perform: (ctx) => {
      const guard = guardSelection(ctx);
      if (guard) return guard;
      return { status: "noop", message: "unavailable" };
    },
  },
};

export const getCommandDefinition = (id: CommandId): CommandDefinition | undefined => definitions[id];

export const listCommands = () => Object.values(definitions);

export const executeCommand = async (id: CommandId, ctx: CommandContext): Promise<CommandResult> => {
  const def = definitions[id];
  if (!def) return { status: "error", message: "unknown_command" };
  const role = resolveRole(ctx.role);
  if (!canExecuteCommandForRole(role, id)) {
    return { status: "noop", message: "forbidden" };
  }
  if (def.allowedRoles && ctx.role && !def.allowedRoles.includes(ctx.role)) {
    return { status: "noop", message: "forbidden" };
  }
  if (def.requiresSelection) {
    const guard = guardSelection(ctx);
    if (guard) return guard;
  }
  if (typeof def.minSelection === "number") {
    const count = ctx.selectionCount ?? ctx.selectionIds?.length ?? 0;
    if (count < def.minSelection) {
      return { status: "noop", message: "selection_too_small" };
    }
  }
  if (def.visible && !def.visible(ctx)) {
    return { status: "noop", message: "hidden" };
  }
  if (def.disabled?.(ctx)) {
    return { status: "noop", message: "disabled" };
  }
  const result = await def.perform(ctx);
  if (result.status === "ok") {
    recordCommandUsage({
      commandId: id,
      objectType: ctx.objectType ?? ctx.selectionType,
      selectionCount: ctx.selectionCount ?? ctx.selectionIds?.length ?? 0,
      role: ctx.role,
    });
  }
  return result;
};
