import { performance } from "node:perf_hooks";
import { buildSceneAabbs, DEFAULT_CLEARANCE } from "../src/lib/collision";
import type { StandConfig, StandModules } from "../src/lib/pricing";

const baseModules: StandModules = {
  wallsClosedSides: 0,
  storageRoom: false,
  counters: 0,
  countersWall: "front",
  countersWithPower: false,
  counterVariant: "basic",
  ledFrames: 0,
  ledFramesDetailed: [],
  screens: 0,
  screensWall: "back",
  truss: false,
  raisedFloor: false,
  trussLights: 0,
  trussLightsFront: 0,
  trussLightsBack: 0,
  trussLightsLeft: 0,
  trussLightsRight: 0,
  wallLightsBack: 0,
  wallLightsLeft: 0,
  wallLightsRight: 0,
  walls: {},
  wallsDetail: {},
  wallPanelRules: {},
  wallPanels: {},
  cabin: undefined,
  floor: undefined,
  accessibility: undefined,
  frameVariant: undefined,
  frameSize: undefined,
  frameColor: undefined,
  activeBundles: undefined,
  detailedScreens: [],
  seating: [],
  chairsDetailed: [],
  roundTables: [],
  customObjects: [],
  trussConfig: undefined,
  trussBannersFront: undefined,
  trussBannersBack: undefined,
  trussBannersLeft: undefined,
  trussBannersRight: undefined,
  trussBannerWidth: undefined,
  trussBannerHeight: undefined,
  trussHeightMode: undefined,
  trussHeightOffset: undefined,
  trussHeight: undefined,
  trussOffset: undefined,
  countersDetailed: [],
};

const makeConfig = (override?: Partial<StandConfig>): StandConfig => ({
  width: 6,
  depth: 4,
  height: 3,
  type: "row",
  region: "NRW",
  rush: false,
  modules: {
    ...baseModules,
    ...(override?.modules as Partial<StandModules> | undefined),
  },
  ...override,
});

describe("buildSceneAabbs", () => {
  it("creates boxes for cabin, detailed counters, and screens with clearance", () => {
    const cfg = makeConfig({
      modules: {
        ...baseModules,
        cabin: { enabled: true, width: 2, depth: 1.5, height: 2.5 },
        countersDetailed: [{ id: "ctr-1", variant: "premium", position: { x: 1, z: 0 } }],
        detailedScreens: [
          { id: "scr-1", screenSize: "55", mount: "wall", wallSide: "left", position: { x: 0, z: 0 } },
        ],
      },
    });

    const boxes = buildSceneAabbs(cfg);
    expect(boxes).toHaveLength(3);

    const cabin = boxes.find((b) => b.id === "cabin");
    expect(cabin?.centerX).toBeCloseTo(-1.75);
    expect(cabin?.centerZ).toBeCloseTo(-1);
    expect(cabin?.halfWidth).toBeCloseTo(1 + DEFAULT_CLEARANCE);
    expect(cabin?.halfDepth).toBeCloseTo(0.75 + DEFAULT_CLEARANCE);

    const counter = boxes.find((b) => b.id.startsWith("ctr-d-"));
    expect(counter?.baseWidth).toBeCloseTo(1.5);
    expect(counter?.halfWidth).toBeCloseTo(0.75 + DEFAULT_CLEARANCE, 4);
    expect(counter?.minX).toBeCloseTo(1 - (0.75 + DEFAULT_CLEARANCE));

    const screen = boxes.find((b) => b.id.startsWith("scr-d-"));
    expect(screen?.baseWidth).toBeCloseTo(0.06);
    expect(screen?.baseDepth).toBeCloseTo(1.23);
    expect(screen?.halfWidth).toBeCloseTo(0.03 + DEFAULT_CLEARANCE, 4);
  });

  it("falls back to legacy counters and screens when no detailed data is present", () => {
    const cfg = makeConfig({
      width: 4,
      depth: 4,
      modules: {
        ...baseModules,
        counters: 2,
        counterVariant: "corner",
        countersDetailed: [],
        screens: 2,
        screensWall: "back",
        detailedScreens: [],
      },
    });

    const boxes = buildSceneAabbs(cfg);

    const legacyCounters = boxes.filter((b) => b.id.startsWith("ctr-legacy-"));
    expect(legacyCounters).toHaveLength(2);
    expect(legacyCounters[0].colliders?.length).toBe(2);

    const firstCounter = legacyCounters[0];
    expect(firstCounter.centerZ).toBeCloseTo(1.5); // front placement
    expect(firstCounter.halfWidth).toBeGreaterThan(firstCounter.baseWidth / 2);

    const legacyScreens = boxes.filter((b) => b.id.startsWith("scr-legacy-"));
    expect(legacyScreens).toHaveLength(2);
    expect(legacyScreens[0].centerZ).toBeCloseTo(-1.93, 2);
    expect(legacyScreens[0].centerX).toBeCloseTo(-0.67, 2);
    expect(legacyScreens[1].centerX).toBeCloseTo(0.67, 2);
  });

  it("handles dense scenes within a tight time budget", () => {
    const chairCount = 200;
    const tableCount = 40;
    const screenCount = 20;
    const counterCount = 10;
    const customCount = 30;

    const heavyCfg = makeConfig({
      width: 20,
      depth: 20,
      modules: {
        ...baseModules,
        chairsDetailed: Array.from({ length: chairCount }, (_, i) => ({
          id: `ch-${i}`,
          type: i % 2 === 0 ? "chair" : "barstool",
          position: { x: (i % 20) - 10, z: Math.floor(i / 20) - 5 },
        })),
        roundTables: Array.from({ length: tableCount }, (_, i) => ({
          id: `tbl-${i}`,
          position: { x: (i % 10) - 5, z: Math.floor(i / 10) - 5 },
        })),
        customObjects: Array.from({ length: customCount }, (_, i) => ({
          id: `obj-${i}`,
          unitPrice: 10,
          assetUrl: "data:obj",
          position: { x: (i % 15) - 7, z: Math.floor(i / 15) - 7 },
        })),
        detailedScreens: Array.from({ length: screenCount }, (_, i) => ({
          id: `sc-${i}`,
          screenSize: "55",
          mount: "floor",
          position: { x: (i % 10) - 5, z: (Math.floor(i / 10) - 1) * 0.5 },
        })),
        countersDetailed: Array.from({ length: counterCount }, (_, i) => ({
          id: `ctr-${i}`,
          variant: "basic",
          position: { x: (i % 5) - 2, z: Math.floor(i / 5) - 2 },
        })),
      },
    });

    const started = performance.now();
    const boxes = buildSceneAabbs(heavyCfg);
    const durationMs = performance.now() - started;

    expect(boxes.length).toBe(chairCount + tableCount + screenCount + counterCount + customCount);
    expect(durationMs).toBeLessThan(1000);
  });
});
