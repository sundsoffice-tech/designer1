import { normalizeWallPanels } from "../src/lib/wallPanels";
import { baseModules, makeConfig } from "./testData";

describe("normalizeWallPanels", () => {
  it("builds panels for closed walls with detail fallbacks", () => {
    const cfg = makeConfig({
      width: 4,
      depth: 3,
      height: 2.8,
      modules: {
        ...baseModules,
        wallsClosedSides: 2,
        wallsDetail: {
          back: { surface: "wood", height: 3 },
          left: { surface: "banner" },
        },
      },
    });

    const { panels, rules } = normalizeWallPanels(cfg, cfg.modules);

    expect(rules.baseWidth).toBe(1);
    expect(rules.defaultHeight).toBeDefined();
    expect(panels.back?.length).toBe(4);
    expect(panels.left?.length).toBe(3);
    expect(panels.right).toEqual([]);
    expect(panels.back?.every((panel) => panel.surface === "wood")).toBe(true);
    expect(panels.back?.every((panel) => panel.height === 3)).toBe(true);
    expect(panels.left?.every((panel) => panel.surface === "banner")).toBe(true);
  });

  it("keeps locked widths and ids when recalculating", () => {
    const cfg = makeConfig({
      width: 3,
      depth: 3,
      modules: {
        ...baseModules,
        wallsClosedSides: 1,
        wallPanelRules: { minWidth: 0.5, maxWidth: 1.5 },
        wallPanels: {
          back: [
            { id: "back-panel-0", width: 1.5, surface: "wood", locked: true },
            { id: "custom", width: 0.4, surface: "seg" },
          ],
        },
      },
    });

    const { panels } = normalizeWallPanels(cfg, cfg.modules);
    const [first, second] = panels.back ?? [];

    expect(first?.width).toBe(1.5);
    expect(first?.id).toBe("back-panel-0");
    expect(first?.locked).toBe(true);
    expect(second?.id).toBe("custom");
    expect(second?.width).toBeGreaterThanOrEqual(0.5);
  });

  it("applies rule defaultHeight when no explicit wall height is set", () => {
    const cfg = makeConfig({
      height: 2.4,
      modules: {
        ...baseModules,
        wallsClosedSides: 1,
        wallPanelRules: { defaultHeight: 3.2 },
      },
    });

    const { panels, rules } = normalizeWallPanels(cfg, cfg.modules);

    expect(rules.defaultHeight).toBe(3.2);
    expect(panels.back?.every((panel) => panel.height === 3.2)).toBe(true);
  });
});
