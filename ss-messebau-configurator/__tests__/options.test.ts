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
    });

    expect(getAllowedOptions(catalog, makeConfig(), "unknown")).toEqual({
      variants: [],
    });
  });

  it("returns all variants when no compatibility gating is triggered", () => {
    const result = getAllowedOptions(catalog, makeConfig(), "ledFrame");

    expect(result.variants.map((v) => v.key)).toEqual(["ledFrame_octalumina", "ledFrame_basic"]);
  });

  it("filters LED frames when a LED wall is configured", () => {
    const configWithLedWall = makeConfig({
      wallsDetail: { back: { surface: "led" } },
    });

    const result = getAllowedOptions(catalog, configWithLedWall, "ledFrame");

    expect(result.variants.map((v) => v.key)).toEqual(["ledFrame_octalumina"]);
  });

  it("filters counters when a power addon is requested", () => {
    const withPowerAddon = makeConfig({ countersWithPower: true });

    const result = getAllowedOptions(catalog, withPowerAddon, "counter");

    expect(result.variants.map((v) => v.key)).toEqual(["counter_premium"]);
  });

  it("keeps all counters when no power addon is requested", () => {
    const result = getAllowedOptions(catalog, makeConfig(), "counter");

    expect(result.variants.map((v) => v.key)).toEqual(["counter_basic", "counter_premium"]);
  });

  it("returns all variants when compatibility config is missing even if guard triggers", () => {
    const catalogWithoutCompat: ModuleCatalog = {
      modules: catalog.modules.map((mod) =>
        mod.module === "ledFrame" ? { ...mod, compatibleWith: undefined } : mod
      ),
    };

    const configWithLedWall = makeConfig({
      wallsDetail: { back: { surface: "led" } },
    });

    const result = getAllowedOptions(catalogWithoutCompat, configWithLedWall, "ledFrame");

    expect(result.variants.map((v) => v.key)).toEqual(["ledFrame_octalumina", "ledFrame_basic"]);
  });

  it("handles undefined config gracefully", () => {
    const result = getAllowedOptions(catalog, undefined, "counter");

    expect(result.variants.map((v) => v.key)).toEqual(["counter_basic", "counter_premium"]);
  });
});
