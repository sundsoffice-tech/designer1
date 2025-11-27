export const DEFAULT_PRICING_MODEL = {
  base: {
    hourlyRateOwn: 60,
    dayRate10h: 550,
    baseMaterialPerM2: 110,
    laborHoursPerM2: 1.2,
    rushSurchargePercent: 0.15,
    safetyMarginPercent: 0.08,
    rentalFactor: 0.72,
  },
  travelCostMap: {
    NRW: 250,
    Nord: 600,
    Süd: 800,
    Ausland: 1500,
  },
  regionFactorMap: {
    NRW: 1.0,
    Nord: 1.04,
    Süd: 1.06,
    Ausland: 1.18,
  },
  legacy: {
    wallBasePricePerM2: 18,
    storageRoomFlat: 600,
    counterPrices: {
      basic: 220,
      premium: 340,
      corner: 280,
    },
    counterPowerSurcharge: 65,
    screenPriceLegacy: 250,
    raisedFloorSurchargePerM2: 45,
  },
  advanced: {
    wallSurcharges: {
      wood: 75,
      led: 220,
      banner: 60,
    },
    floorSurchargePerM2: {
      laminate: 18,
      vinyl: 14,
      wood: 28,
    },
    cabinPricePerM2: 360,
    cabinDoorPrice: 220,
    screenPriceBySize: {
      "55": 250,
      "65": 380,
      "75": 520,
    },
    seatingBasePrice: {
      chair: 18,
      barstool: 36,
      lounge: 75,
    },
    seatingCoverSurcharge: {
      none: 0,
      white: 6,
      branding: 18,
    },
    roundTablePrice: 65,
    trussMeterPrice: 65,
    trussLightPrice: 120,
    trussBannerFramePrice: 260,
    wallLightPrice: 60,
  },
  customers: {
    defaultMultiplier: 1,
    profiles: {
      "demo-vip": { discountPercent: 12, label: "Demo/VIP Rabatt" },
      rahmenvertrag: { discountPercent: 8, label: "Rahmenvertrag 2025" },
    },
  },
  modules: {
    counter_basic: {
      key: "counter_basic",
      label: "Counter Basic",
      kind: "counter",
      variant: "basic",
      dimensions: { width: 1, depth: 0.55, height: 1.05 },
      price: 500,
      collider: "aabb",
      defaultColor: "#1d4ed8",
      tags: ["counter", "frontdesk"],
    },
    counter_premium: {
      key: "counter_premium",
      label: "Counter Premium",
      kind: "counter",
      variant: "premium",
      dimensions: { width: 1.5, depth: 0.62, height: 1.1 },
      price: 650,
      collider: "aabb",
      defaultColor: "#0f172a",
      tags: ["counter", "premium"],
    },
    counter_corner: {
      key: "counter_corner",
      label: "Counter Corner",
      kind: "counter",
      variant: "corner",
      dimensions: { width: 1.5, depth: 0.62, height: 1.1 },
      price: 700,
      collider: "obb",
      defaultColor: "#1e293b",
      tags: ["counter", "corner"],
    },
    screen_wall_55: {
      key: "screen_wall_55",
      label: 'Wall Screen 55"',
      kind: "screen",
      dimensions: { width: 1.23, height: 0.69, depth: 0.06 },
      resolution: "3840x2160",
      mount: "wall",
      collider: "aabb",
      price: 800,
      tags: ["screen", "wall"],
    },
    truss_square: {
      key: "truss_square",
      label: "Truss Square",
      kind: "truss",
      dimensions: { width: 3, depth: 3, height: 3.5 },
      collider: "obb",
      price: 1200,
      defaultColor: "#d1d5db",
      tags: ["truss"],
    },
    traverse_basic: {
      key: "traverse_basic",
      label: "Traverse Basic",
      kind: "truss",
      dimensions: { width: 6, depth: 4, height: 4 },
      collider: "aabb",
      price: 1250,
      defaultColor: "#cbd5e1",
      tags: ["traverse", "rigging"],
    },
  },
};

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const deepMerge = (base, patch) => {
  const out = { ...base };
  if (!isPlainObject(patch)) return out;

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (isPlainObject(value)) {
      out[key] = deepMerge(base[key] || {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

export const mergePricingModel = (incoming) => deepMerge(DEFAULT_PRICING_MODEL, incoming || {});

export const resolveCustomerMultiplier = (model, customerId, explicitMultiplier) => {
  if (typeof explicitMultiplier === "number" && explicitMultiplier > 0) {
    return {
      multiplier: explicitMultiplier,
      source: "override",
      profileId: customerId ?? null,
    };
  }

  const customers = model?.customers || {};
  const defaultMultiplier =
    typeof customers.defaultMultiplier === "number" && customers.defaultMultiplier > 0
      ? customers.defaultMultiplier
      : 1;

  if (!customerId) {
    return { multiplier: defaultMultiplier, source: "default", profileId: null };
  }

  const profile = customers.profiles?.[customerId];
  if (!profile) {
    return { multiplier: defaultMultiplier, source: "default", profileId: null };
  }

  const profileMultiplier =
    typeof profile.multiplier === "number" && profile.multiplier > 0
      ? profile.multiplier
      : typeof profile.discountPercent === "number"
      ? 1 - profile.discountPercent / 100
      : undefined;

  return {
    multiplier: profileMultiplier || defaultMultiplier,
    source: "profile",
    profileId: customerId,
    profileLabel: profile.label,
  };
};
