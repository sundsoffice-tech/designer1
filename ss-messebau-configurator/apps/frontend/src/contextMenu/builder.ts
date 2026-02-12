import { contextMenuConfig, contextMenuPresets } from "../config/contextMenu";
import { canExecuteCommandForRole, isCommandVisibleForRole } from "../config/roles";
import type { CommandId } from "../store/commandTypes";
import { getCommandDefinition } from "../store/commandRegistry";
import { getFrequentCommands } from "./analytics";
import type {
  BuiltContextMenu,
  ContextMenuContext,
  ContextMenuItem,
  ContextMenuItemConfig,
  ContextMenuPreset,
  MenuSelectionFilter,
} from "./types";

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

const matchesSelection = (filter: MenuSelectionFilter | undefined, selectionCount: number) => {
  if (filter === "none") return selectionCount === 0;
  if (filter === "single") return selectionCount === 1;
  if (filter === "multi") return selectionCount >= 2;
  if (filter === "any") return selectionCount > 0;
  return true;
};

const matchesPreset = (preset: ContextMenuPreset, context: ContextMenuContext): boolean => {
  const selectionCount = context.selectionCount ?? context.selectionIds.length;
  if (!matchesSelection(preset.selection, selectionCount)) return false;
  if (preset.objectTypes?.length) {
    const type = context.objectType ?? context.selectionType;
    if (!type) return false;
    return preset.objectTypes.includes(type);
  }
  return true;
};

const resolvePreset = (context: ContextMenuContext): ContextMenuPreset | null => {
  const selectionCount = context.selectionCount ?? context.selectionIds.length;
  const typedContext = { ...context, selectionCount };
  const directMatch = contextMenuPresets.find((preset) => matchesPreset(preset, typedContext));
  if (directMatch) return directMatch;
  const selectionFallback = contextMenuPresets.find(
    (preset) => preset.selection === "any" && !preset.objectTypes?.length
  );
  if (selectionFallback) return selectionFallback;
  const emptyFallback = contextMenuPresets.find((preset) => preset.selection === "none");
  return emptyFallback ?? null;
};

const fromConfig = (config: ContextMenuItemConfig, context: ContextMenuContext): ContextMenuItem | null => {
  if (config.when && !config.when(context)) return null;
  const item = toItem(
    config.commandId,
    {
      id: config.id ?? config.commandId,
      icon: config.icon,
      group: config.group,
      destructive: config.destructive,
      separatorBefore: config.separatorBefore,
    },
    context
  );
  if (!item) return null;
  const disabled = typeof config.disabled === "function" ? config.disabled(context) : config.disabled;
  return disabled ? { ...item, disabled: true } : item;
};

const buildFromPreset = (preset: ContextMenuPreset, context: ContextMenuContext): ContextMenuItem[] =>
  preset.items.map((cfg) => fromConfig(cfg, context)).filter(Boolean) as ContextMenuItem[];

const buildFrequent = (context: ContextMenuContext): ContextMenuItem[] => {
  if (!contextMenuConfig.enablePersonalizedGroups) return [];
  const frequentIds = getFrequentCommands(context.objectType ?? context.selectionType, contextMenuConfig.frequentLimit);
  return frequentIds
    .map((id) => toItem(id, { icon: "custom", group: "frequent" }, context))
    .filter(Boolean) as ContextMenuItem[];
};

export const buildContextMenu = (context: ContextMenuContext): BuiltContextMenu => {
  const selectionCount = context.selectionCount ?? context.selectionIds.length;
  const baseContext: ContextMenuContext = { ...context, selectionCount };
  const preset = resolvePreset(baseContext);
  const items: ContextMenuItem[] = [];
  items.push(...buildFrequent(baseContext));
  if (preset) {
    items.push(...buildFromPreset(preset, baseContext));
  }
  const ordered = byGroup(items);
  return {
    items: ordered,
    context: baseContext,
  };
};
