import { contextMenuConfig } from "../config/contextMenu";
import { canExecuteCommandForRole, isCommandVisibleForRole } from "../config/roles";
import type { CommandId } from "../store/commandTypes";
import { getCommandDefinition } from "../store/commandRegistry";
import { getFrequentCommands } from "./analytics";
import type { BuiltContextMenu, ContextMenuContext, ContextMenuItem } from "./types";

const byGroup = (items: ContextMenuItem[]): ContextMenuItem[] => {
  const ordered: ContextMenuItem[] = [];
  let lastGroup: string | undefined;
  items.forEach((item) => {
    if (!item.group) {
      ordered.push(item);
      return;
    }
    const needsSeparator = !!lastGroup && lastGroup !== item.group;
    lastGroup = item.group;
    ordered.push(needsSeparator ? { ...item, separatorBefore: true } : item);
  });
  return ordered;
};

const toItem = (id: CommandId, overrides: Partial<ContextMenuItem>, context: ContextMenuContext): ContextMenuItem | null => {
  const def = getCommandDefinition(id);
  if (!def) return null;
  const role = context.role;
  if (!isCommandVisibleForRole(role, id)) return null;
  const selectionCount = context.selectionCount ?? context.selectionIds.length;
  if (def.requiresSelection && selectionCount <= 0) return null;
  if (typeof def.minSelection === "number" && selectionCount < def.minSelection) return null;
  const disabled = def.disabled?.(context) || !canExecuteCommandForRole(role, id);
  return {
    id,
    labelKey: def.labelKey,
    commandId: id,
    disabled,
    ...overrides,
  };
};

const buildEmptyAreaMenu = (context: ContextMenuContext): ContextMenuItem[] => {
  const items: (ContextMenuItem | null)[] = [
    toItem("centerCameraHere", { icon: "camera", group: "scene" }, context),
    toItem("selectAll", { icon: "select", group: "selection" }, context),
    toItem("clearSelection", { icon: "select", group: "selection" }, context),
  ];
  return items.filter(Boolean) as ContextMenuItem[];
};

const buildScreenMenu = (context: ContextMenuContext): ContextMenuItem[] => {
  const items: (ContextMenuItem | null)[] = [
    toItem("focusCamera", { icon: "focus", group: "object" }, context),
    toItem("duplicate", { icon: "duplicate", group: "object" }, context),
    toItem("delete", { icon: "delete", group: "object", destructive: true }, context),
    toItem("changeScreenVideo", { icon: "screen", group: "object" }, context),
    toItem("changeMaterial", { icon: "material", group: "object" }, context),
    toItem("resetTransform", { icon: "reset", group: "object" }, context),
    toItem("snapToGrid", { icon: "grid", group: "object" }, context),
  ];
  return items.filter(Boolean) as ContextMenuItem[];
};

const buildCounterMenu = (context: ContextMenuContext): ContextMenuItem[] => {
  const items: (ContextMenuItem | null)[] = [
    toItem("focusCamera", { icon: "focus", group: "object" }, context),
    toItem("duplicate", { icon: "duplicate", group: "object" }, context),
    toItem("delete", { icon: "delete", group: "object", destructive: true }, context),
    toItem("changeMaterial", { icon: "material", group: "object" }, context),
    toItem("resetTransform", { icon: "reset", group: "object" }, context),
    toItem("alignToGrid", { icon: "grid", group: "object" }, context),
  ];
  return items.filter(Boolean) as ContextMenuItem[];
};

const buildGenericSelectionMenu = (context: ContextMenuContext): ContextMenuItem[] => {
  const items: (ContextMenuItem | null)[] = [
    toItem("focusCamera", { icon: "focus", group: "selection" }, context),
    toItem("duplicate", { icon: "duplicate", group: "selection" }, context),
    toItem("delete", { icon: "delete", group: "selection", destructive: true }, context),
    toItem("resetTransform", { icon: "reset", group: "selection" }, context),
    toItem("snapToGrid", { icon: "grid", group: "selection" }, context),
    toItem("clearSelection", { icon: "select", group: "selection" }, context),
  ];
  return items.filter(Boolean) as ContextMenuItem[];
};

const buildFrequent = (context: ContextMenuContext): ContextMenuItem[] => {
  if (!contextMenuConfig.enablePersonalizedGroups) return [];
  const frequentIds = getFrequentCommands(context.objectType ?? context.selectionType, contextMenuConfig.frequentLimit);
  return frequentIds
    .map((id) => toItem(id, { icon: "custom", group: "frequent" }, context))
    .filter(Boolean) as ContextMenuItem[];
};

export const buildContextMenu = (context: ContextMenuContext): BuiltContextMenu => {
  const items: ContextMenuItem[] = [];
  const selectionCount = context.selectionCount ?? context.selectionIds.length;
  const baseContext: ContextMenuContext = { ...context, selectionCount };
  const frequent = buildFrequent(baseContext);
  items.push(...frequent);

  if (context.objectType === "screen") {
    items.push(...buildScreenMenu(baseContext));
  } else if (context.objectType === "counter") {
    items.push(...buildCounterMenu(baseContext));
  } else if (!context.objectType && selectionCount === 0) {
    items.push(...buildEmptyAreaMenu(baseContext));
  } else {
    items.push(...buildGenericSelectionMenu(baseContext));
  }

  const ordered = byGroup(items);
  return {
    items: ordered,
    context: baseContext,
  };
};
