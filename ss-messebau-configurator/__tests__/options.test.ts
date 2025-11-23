import { getAllowedOptions } from "../src/utils/options";
import type { ModuleCatalog } from "../src/types/modules";
import type { StandConfig, StandModules } from "../src/lib/pricing";

const catalog: ModuleCatalog = {
  modules: [
    {
      module: "ledFrame",
      label: "LED Frame",
      kind: "frame",
      variants: [
        {
          key: "ledFrame_octalumina",
          name: "Octalumina",
          sizes: [2.5, 3],
          colors: ["black", "white"],
        },
        {
          key: "ledFrame_basic",
          name: "Basic",
          sizes: [3, 4],
          colors: ["white", "silver"],
        },
      ],
      compatibleWith: {
        ledWall: ["ledFrame_octalumina"],
      },
    },
    {
      module: "counter",
      label: "Counter",
      kind: "counter",
      variants: [
        {
          key: "counter_basic",
          name: "Counter Basic",
          colors: ["white"],
        },
        {
          key: "counter_premium",
          name: "Counter Premium",
          colors: ["black", "white"],
        },
      ],
      compatibleWith: {
        powerAddon: ["counter_premium"],
      },
    },
  ],
};

const baseModules: StandModules = {
  wallsClosedSides: 0,
  storageRoom: false,
  counters: 0,
  screens: 0,
};

const makeConfig = (override?: Partial<StandModules>): StandConfig => ({
  width: 3,
  depth: 3,
  height: 3,
  type: "row",
  region: "NRW",
  rush: false,
  modules: { ...baseModules, ...(override ?? {}) },
});

describe("getAllowedOptions", () => {
  it("returns empty result when catalog or module is missing", () => {
    expect(getAllowedOptions(null, makeConfig(), "ledFrame")).toEqual({
      variants: [],
      sizes: [],
      colors: [],
    });

    expect(getAllowedOptions(catalog, makeConfig(), "unknown")).toEqual({
      variants: [],
      sizes: [],
      colors: [],
    });
  });

  it("returns all variants when no compatibility gating is triggered", () => {
    const result = getAllowedOptions(catalog, makeConfig(), "ledFrame");

    expect(result.variants.map((v) => v.key)).toEqual(["ledFrame_octalumina", "ledFrame_basic"]);
    expect(result.sizes).toEqual([2.5, 3, 4]);
    expect(result.colors).toEqual(["black", "white", "silver"]);
  });

  it("filters LED frames when a LED wall is configured", () => {
    const configWithLedWall = makeConfig({
      wallsDetail: { back: { surface: "led" } },
    });

    const result = getAllowedOptions(catalog, configWithLedWall, "ledFrame");

    expect(result.variants.map((v) => v.key)).toEqual(["ledFrame_octalumina"]);
    expect(result.sizes).toEqual([2.5, 3]);
    expect(result.colors).toEqual(["black", "white"]);
  });

  it("filters counters when a power addon is requested", () => {
    const withPowerAddon = makeConfig({ countersWithPower: true });

    const result = getAllowedOptions(catalog, withPowerAddon, "counter");

    expect(result.variants.map((v) => v.key)).toEqual(["counter_premium"]);
    expect(result.colors).toEqual(["black", "white"]);
  });

  it("keeps all counters when no power addon is requested", () => {
    const result = getAllowedOptions(catalog, makeConfig(), "counter");

    expect(result.variants.map((v) => v.key)).toEqual(["counter_basic", "counter_premium"]);
  });
});
