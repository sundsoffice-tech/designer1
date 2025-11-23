jest.mock("../src/services/modules", () => ({
  moduleVariantsByKey: {
    ledFrame_octalumina: {
      key: "ledFrame_octalumina",
      name: "Octalumina",
      sizes: [2.5, 3, 4],
      basePrice: 1284,
      kind: "frame",
      module: "ledFrame",
    },
    counter_basic: {
      key: "counter_basic",
      name: "Counter Basic",
      basePrice: 500,
      variant: "basic",
      kind: "counter",
      module: "counter",
    },
    counter_premium: {
      key: "counter_premium",
      name: "Counter Premium",
      basePrice: 650,
      variant: "premium",
      kind: "counter",
      module: "counter",
    },
    counter_corner: {
      key: "counter_corner",
      name: "Counter Corner",
      basePrice: 700,
      variant: "corner",
      kind: "counter",
      module: "counter",
    },
    screen_wall_75: {
      key: "screen_wall_75",
      name: "Wall Screen 75\"",
      basePrice: 1050,
      variant: "75",
      kind: "screen",
      module: "screen",
      screenSize: "75",
      mount: "wall",
    },
  },
  moduleBundles: [
    {
      key: "bundle_premium_led_set",
      label: "Premium LED Set",
      items: [
        { variantKey: "counter_premium", quantity: 1 },
        { variantKey: "ledFrame_octalumina", quantity: 1 },
        { variantKey: "screen_wall_75", quantity: 1 },
      ],
      discountPercent: 12,
    },
  ],
  moduleCatalog: {},
  moduleCompatibilityIndex: {},
}));

import { calcPriceDetailed, type StandConfig, type StandModules } from "../src/lib/pricing";

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
  width: 3,
  depth: 3,
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

describe("calcPriceDetailed", () => {
  it("calculates base price with day-rate labor and no modules", () => {
    const cfg = makeConfig();
    const result = calcPriceDetailed(cfg);

    expect(result.breakdown.base.material).toBeCloseTo(990);
    expect(result.breakdown.base.labor).toBeCloseTo(1100);
    expect(result.breakdown.base.modules.total).toBe(0);
    expect(result.breakdown.base.travel).toBe(250);
    expect(result.breakdown.base.subtotal).toBeCloseTo(2340);

    expect(result.breakdown.surcharges.regionFactor).toBe(1);
    expect(result.breakdown.surcharges.marginAmount).toBeCloseTo(187.2);
    expect(result.breakdown.customer.multiplier).toBe(1);
    expect(result.breakdown.optionalServices).toHaveLength(0);

    expect(result.total).toBe(2527);
    expect(result.breakdown.rentalTotal).toBe(1820);
  });

  it("applies legacy module pricing, rush surcharge, and region factors", () => {
    const cfg = makeConfig({
      width: 5,
      depth: 4,
      region: "Nord",
      rush: true,
      modules: {
        ...baseModules,
        counters: 2,
        countersWall: "front",
        countersWithPower: true,
        counterVariant: "premium",
        screens: 3,
        raisedFloor: true,
        storageRoom: true,
      },
    });

    const result = calcPriceDetailed(cfg);
    const legacy = result.breakdown.base.modules.legacy;

    expect(legacy).toMatchObject({
      storage: 600,
      counters: 810,
      screens: 750,
      raisedFloor: 900,
    });
    expect(legacy.total).toBe(3060);
    expect(result.breakdown.base.modules.total).toBeCloseTo(3060);

    expect(result.breakdown.base.subtotal).toBeCloseTo(7510);
    expect(result.breakdown.surcharges.regionFactor).toBeCloseTo(1.04);
    expect(result.breakdown.surcharges.rushAmount).toBeCloseTo(1171.56);
    expect(result.breakdown.optionalServices).toEqual([
      expect.objectContaining({ label: "Eilservice" }),
    ]);

    expect(result.total).toBe(9701);
    expect(result.breakdown.rentalTotal).toBe(6984);
  });

  it("aggregates advanced modules, bundle discounts, and customer profiles", () => {
    const cfg = makeConfig({
      width: 4,
      depth: 4,
      height: 3,
      region: "Sued",
      modules: {
        ...baseModules,
        wallsClosedSides: 3,
        wallsDetail: {
          back: { surface: "wood" },
          left: { surface: "led" },
          right: { surface: "banner" },
        },
        floor: { type: "laminate", raised: true },
        cabin: {
          enabled: true,
          width: 2,
          depth: 2,
          height: 2.5,
          doors: [{ side: "front", width: 1 }],
        },
        countersWithPower: true,
        counterVariant: "premium",
        countersDetailed: [
          { id: "c1", variant: "premium", withPower: true, position: { x: 0, z: 0 } },
        ],
        detailedScreens: [
          { id: "s1", screenSize: "75", mount: "wall", wallSide: "back", position: { x: 0, z: 0 } },
        ],
        ledFramesDetailed: [{ variant: "ledFrame_octalumina", size: 2.5, count: 1 }],
        seating: [
          { type: "chair", count: 4, cover: "white" },
          { type: "lounge", count: 1, cover: "branding" },
        ],
        chairsDetailed: [{ id: "ch1", type: "barstool", cover: "branding", position: { x: 0, z: 0 } }],
        roundTables: [
          { id: "t1", position: { x: 0, z: 0 } },
          { id: "t2", unitPrice: 80, position: { x: 0, z: 0 } },
        ],
        customObjects: [
          { id: "obj1", unitPrice: 200, assetUrl: "data:obj1", position: { x: 0, z: 0 } },
          { id: "obj2", unitPrice: 50, assetUrl: "data:obj2", position: { x: 1, z: 1 } },
        ],
        truss: true,
        trussLightsFront: 2,
        trussLightsBack: 1,
        trussLightsLeft: 0,
        trussLightsRight: 0,
        trussBannersFront: 1,
        wallLightsDetailed: [
          { id: "w1", side: "back", unitPrice: 80 },
          { id: "w2", side: "left" },
        ],
        activeBundles: ["bundle_premium_led_set"],
      },
    });

    const result = calcPriceDetailed(cfg, undefined, { customerId: "demo-vip" });
    const advanced = result.breakdown.base.modules.advanced;

    expect(advanced.walls).toBeCloseTo(4908);
    expect(advanced.floor).toBeCloseTo(1008);
    expect(advanced.cabin).toBeCloseTo(1660);
    expect(advanced.screens).toBeCloseTo(520);
    expect(advanced.frames).toBeCloseTo(1284);
    expect(advanced.counters).toBeCloseTo(405);
    expect(advanced.seating).toBeCloseTo(189);
    expect(advanced.chairs).toBeCloseTo(54);
    expect(advanced.tables).toBeCloseTo(145);
    expect(advanced.custom).toBeCloseTo(250);
    expect(advanced.truss).toBeCloseTo(1300);
    expect(advanced.lights).toBeCloseTo(500);
    expect(advanced.bundles).toBeCloseTo(-265.08);
    expect(advanced.total).toBeCloseTo(11957.92, 2);
    expect(result.breakdown.base.modules.total).toBeCloseTo(11957.92, 2);

    expect(result.breakdown.base.travel).toBe(800);
    expect(result.breakdown.surcharges.regionFactor).toBeCloseTo(1.06);
    expect(result.breakdown.customer.multiplier).toBeCloseTo(0.88);
    expect(result.breakdown.total).toBe(15734);
    expect(result.breakdown.rentalTotal).toBe(11328);
  });
});
