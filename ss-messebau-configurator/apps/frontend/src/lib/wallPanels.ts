import type {
  StandConfig,
  StandModules,
  WallPanelConfig,
  WallPanelRules,
  WallSide,
  WallSurface,
} from "./pricing";

const DEFAULT_PANEL_RULES: WallPanelRules = {
  baseWidth: 1,
  minWidth: 0.6,
  maxWidth: 1.5,
  defaultHeight: 2.5,
  defaultSurface: "system",
};

const mergePanelRules = (rules?: Partial<WallPanelRules>): WallPanelRules => ({
  ...DEFAULT_PANEL_RULES,
  ...(rules ?? {}),
});

function buildPanelsForSide(
  side: WallSide,
  length: number,
  rules: WallPanelRules,
  prev?: WallPanelConfig[],
  fallbackSurface: WallSurface = "system",
  fallbackHeight?: number
): WallPanelConfig[] {
  if (length <= 0) return [];
  const prevPanels = prev ?? [];

  let count = Math.max(1, Math.round(length / rules.baseWidth));
  let slotWidth = length / count;

  let guard = 0;
  while (slotWidth < rules.minWidth && count > 1 && guard < 20) {
    count -= 1;
    slotWidth = length / count;
    guard += 1;
  }
  guard = 0;
  while (slotWidth > rules.maxWidth && guard < 20) {
    count += 1;
    slotWidth = length / count;
    guard += 1;
  }

  const panels: WallPanelConfig[] = [];
  let remaining = length;

  for (let i = 0; i < count; i++) {
    const prevPanel = prevPanels[i];
    const isLast = i === count - 1;
    const defaultWidth = isLast ? remaining : Math.min(slotWidth, Math.max(0.2, remaining / (count - i)));

    const locked = prevPanel?.locked ?? false;
    let width = locked ? prevPanel?.width ?? defaultWidth : prevPanel?.width ?? defaultWidth;
    width = Math.max(rules.minWidth, Math.min(rules.maxWidth, width));

    remaining -= width;
    if (isLast && Math.abs(remaining) > 1e-3) {
      width += remaining;
      remaining = 0;
    }

    panels.push({
      id: prevPanel?.id ?? `${side}-panel-${i}`,
      width,
      height: prevPanel?.height ?? fallbackHeight,
      surface: prevPanel?.surface ?? fallbackSurface,
      finishId: prevPanel?.finishId,
      locked,
    });
  }

  return panels;
}

export function normalizeWallPanels(
  cfg: StandConfig,
  modules: StandModules
): { rules: WallPanelRules; panels: Partial<Record<WallSide, WallPanelConfig[]>> } {
  const rules = mergePanelRules(modules.wallPanelRules);
  const existing = (modules.wallPanels ?? {}) as Partial<Record<WallSide, WallPanelConfig[]>>;
  const detail = (modules.wallsDetail ?? {}) as Partial<
    Record<WallSide, { surface?: WallSurface; height?: number; finishId?: string }>
  >;
  const wallsConfig = modules.walls ?? {};

  const panels: Partial<Record<WallSide, WallPanelConfig[]>> = {};

  const sides: WallSide[] = ["back", "left", "right"];
  const hasSide: Record<WallSide, boolean> = {
    back: (modules.wallsClosedSides ?? 0) >= 1,
    left: (modules.wallsClosedSides ?? 0) >= 2,
    right: (modules.wallsClosedSides ?? 0) >= 3,
    front: false,
  };

  sides.forEach((side) => {
    if (!hasSide[side]) {
      panels[side] = [];
      return;
    }
    const length = side === "back" ? cfg.width : cfg.depth;
    const fallbackSurface = (detail[side]?.surface ?? rules.defaultSurface ?? "system") as WallSurface;
    const customDefaultHeight = modules.wallPanelRules?.defaultHeight;
    const fallbackHeight =
      detail[side]?.height ??
      wallsConfig[side]?.height ??
      (customDefaultHeight ?? cfg.height ?? DEFAULT_PANEL_RULES.defaultHeight ?? 2.5);
    panels[side] = buildPanelsForSide(
      side,
      length,
      rules,
      existing[side],
      fallbackSurface,
      fallbackHeight
    );
  });

  return { rules, panels };
}
