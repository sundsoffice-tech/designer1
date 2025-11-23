import { buildSceneAabbs } from "../src/lib/collision";
import { baseModules, makeConfig } from "./testData";

describe("buildSceneAabbs", () => {
  it("creates boxes for cabin, detailed modules, and truss columns", () => {
    const cfg = makeConfig({
      width: 6,
      depth: 4,
      modules: {
        ...baseModules,
        cabin: { enabled: true, width: 2, depth: 1.5, height: 2.5 },
        countersDetailed: [{ id: "ctr-1", variant: "premium", position: { x: 1, z: 0 } }],
        detailedScreens: [
          { id: "scr-1", screenSize: "55", mount: "wall", wallSide: "left", position: { x: 0.5, z: 0 } },
        ],
        truss: true,
      },
    });

    const boxes = buildSceneAabbs(cfg);
    expect(boxes).toHaveLength(7);

    const cabin = boxes.find((b) => b.id === "cabin");
    expect(cabin?.minX).toBeCloseTo(-2.95, 2);
    expect(cabin?.maxX).toBeCloseTo(-0.55, 2);
    expect(cabin?.minZ).toBeCloseTo(-1.95, 2);
    expect(cabin?.maxZ).toBeCloseTo(-0.05, 2);

    const counter = boxes.find((b) => b.id.startsWith("ctr-d-"));
    expect(counter?.minX).toBeCloseTo(0.1, 2);
    expect(counter?.maxX).toBeCloseTo(1.9, 2);

    const screen = boxes.find((b) => b.id.startsWith("scr-d-"));
    expect(screen?.minX).toBeCloseTo(0.29, 2);
    expect(screen?.maxX).toBeCloseTo(0.71, 2);

    const trussColumns = boxes.filter((b) => b.id.startsWith("truss-col-"));
    expect(trussColumns).toHaveLength(4);
  });

  it("returns an empty list when no detailed modules are configured", () => {
    const cfg = makeConfig({ modules: { ...baseModules, cabin: undefined, truss: false } });
    expect(buildSceneAabbs(cfg)).toEqual([]);
  });

  it("creates seating boxes based on seating geometry", () => {
    const cfg = makeConfig({
      modules: {
        ...baseModules,
        chairsDetailed: [
          { id: "chair-1", type: "chair", position: { x: 0, z: 0 } },
          { id: "bar-1", type: "barstool", position: { x: 1, z: 1 } },
        ],
      },
    });

    const boxes = buildSceneAabbs(cfg);
    expect(boxes).toHaveLength(2);

    const chair = boxes.find((b) => b.id === "seat-chair-1");
    expect(chair?.minX).toBeCloseTo(-0.44, 2);
    expect(chair?.maxZ).toBeCloseTo(0.45, 2);

    const barstool = boxes.find((b) => b.id === "seat-bar-1");
    expect(barstool?.minX).toBeCloseTo(0.58, 2);
    expect(barstool?.maxZ).toBeCloseTo(1.42, 2);
  });
});
