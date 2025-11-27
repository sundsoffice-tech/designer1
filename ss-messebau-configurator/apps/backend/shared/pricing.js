import { mergePricingModel, resolveCustomerMultiplier } from "./pricingDefaults.js";

const resolvePricing = (model) => {
  const merged = mergePricingModel(model);
  const base = merged.base || {};
  const legacy = merged.legacy || {};
  const advanced = merged.advanced || {};

  const travelCostMap = {
    NRW: 0,
    Nord: 0,
    Süd: 0,
    Ausland: 0,
    ...(merged.travelCostMap || {}),
  };

  if (travelCostMap["S�d"] != null && travelCostMap["Süd"] == null) {
    travelCostMap["Süd"] = travelCostMap["S�d"];
  }

  const regionFactorMap = {
    NRW: 1,
    Nord: 1,
    Süd: 1,
    Ausland: 1,
    ...(merged.regionFactorMap || {}),
  };

  if (regionFactorMap["S�d"] != null && regionFactorMap["Süd"] == null) {
    regionFactorMap["Süd"] = regionFactorMap["S�d"];
  }

  return {
    baseMaterialPerM2: base.baseMaterialPerM2 ?? 0,
    laborHoursPerM2: base.laborHoursPerM2 ?? 1,
    hourlyRateOwn: base.hourlyRateOwn ?? 0,
    dayRate10h: base.dayRate10h ?? 0,
    rushSurchargePercent: base.rushSurchargePercent ?? 0,
    safetyMarginPercent: base.safetyMarginPercent ?? 0,
    travelCostMap,
    regionFactorMap,
    wallBasePricePerM2: legacy.wallBasePricePerM2 ?? 0,
    storageRoomFlat: legacy.storageRoomFlat ?? 0,
    counterPrices: {
      basic: legacy.counterPrices?.basic ?? 0,
      premium: legacy.counterPrices?.premium ?? 0,
      corner: legacy.counterPrices?.corner ?? 0,
    },
    counterPowerSurcharge: legacy.counterPowerSurcharge ?? 0,
    screenPriceLegacy: legacy.screenPriceLegacy ?? 0,
    raisedFloorSurchargePerM2: legacy.raisedFloorSurchargePerM2 ?? 0,
    wallSurcharges: {
      plain: 0,
      seg: 0,
      wood: advanced.wallSurcharges?.wood ?? 0,
      led: advanced.wallSurcharges?.led ?? 0,
      banner: advanced.wallSurcharges?.banner ?? 0,
    },
    floorSurchargePerM2: {
      carpet: 0,
      laminate: advanced.floorSurchargePerM2?.laminate ?? 0,
      vinyl: advanced.floorSurchargePerM2?.vinyl ?? 0,
      wood: advanced.floorSurchargePerM2?.wood ?? 0,
    },
    cabinPricePerM2: advanced.cabinPricePerM2 ?? 0,
    cabinDoorPrice: advanced.cabinDoorPrice ?? 0,
    screenPriceBySize: {
      "55": advanced.screenPriceBySize?.["55"] ?? 0,
      "65": advanced.screenPriceBySize?.["65"] ?? 0,
      "75": advanced.screenPriceBySize?.["75"] ?? 0,
    },
    seatingBasePrice: {
      chair: advanced.seatingBasePrice?.chair ?? 0,
      barstool: advanced.seatingBasePrice?.barstool ?? 0,
      lounge: advanced.seatingBasePrice?.lounge ?? 0,
    },
    seatingCoverSurcharge: {
      none: advanced.seatingCoverSurcharge?.none ?? 0,
      white: advanced.seatingCoverSurcharge?.white ?? 0,
      branding: advanced.seatingCoverSurcharge?.branding ?? 0,
    },
    roundTablePrice: advanced.roundTablePrice ?? 0,
    trussMeterPrice: advanced.trussMeterPrice ?? 0,
    trussLightPrice: advanced.trussLightPrice ?? 0,
    trussBannerFramePrice: advanced.trussBannerFramePrice ?? 0,
    wallLightPrice: advanced.wallLightPrice ?? 0,
    rentalFactor: base.rentalFactor ?? 1,
  };
};

const calcLaborCost = (area, pricing) => {
  const hours = area * pricing.laborHoursPerM2;
  if (hours >= 9) {
    const days = Math.ceil(hours / 10);
    return days * pricing.dayRate10h;
  }
  return hours * pricing.hourlyRateOwn;
};

const getWallSideLength = (cfg, side) => (side === "back" ? cfg.width : cfg.depth);

const mapSurfaceToWallType = (surface) => {
  switch (surface) {
    case "wood":
      return "wood";
    case "banner":
      return "banner";
    case "seg":
      return "seg";
    case "led":
      return "led";
    default:
      return "plain";
  }
};

const calcLegacyModuleCost = (cfg, area, pricing) => {
  const m = cfg.modules;
  let sum = 0;

  const useLegacyCabin = !m.cabin?.enabled;
  if (useLegacyCabin && m.storageRoom) {
    sum += pricing.storageRoomFlat;
  }

  const useLegacyCounters = !m.countersDetailed || m.countersDetailed.length === 0;
  if (useLegacyCounters) {
    const count = m.counters ?? 0;
    const variant = m.counterVariant ?? "basic";

    let basePrice = pricing.counterPrices.basic;
    if (variant === "premium") basePrice = pricing.counterPrices.premium;
    else if (variant === "corner") basePrice = pricing.counterPrices.corner;

    sum += count * basePrice;

    if (m.countersWithPower) {
      sum += count * pricing.counterPowerSurcharge;
    }
  }

  const useLegacyScreens = !m.detailedScreens || m.detailedScreens.length === 0;
  if (useLegacyScreens) {
    sum += (m.screens ?? 0) * pricing.screenPriceLegacy;
  }

  const useLegacyRaised = !m.floor?.raised;
  if (useLegacyRaised && m.raisedFloor) {
    sum += pricing.raisedFloorSurchargePerM2 * area;
  }

  return sum;
};

const calcAdvancedWallsCost = (cfg, pricing) => {
  const m = cfg.modules;
  const wallsClosed = m.wallsClosedSides ?? 0;
  if (wallsClosed <= 0) return 0;

  const baseHeight = cfg.height || 2.5;
  const details = m.wallsDetail ?? {};
  const wallsConfig = m.walls ?? {};

  let sum = 0;

  ["back", "left", "right"].forEach((side) => {
    const isClosed =
      (side === "back" && wallsClosed >= 1) ||
      (side === "left" && wallsClosed >= 2) ||
      (side === "right" && wallsClosed >= 3);
    if (!isClosed) return;

    const length = getWallSideLength(cfg, side);
    const wallHeight = details[side]?.height ?? wallsConfig[side]?.height ?? baseHeight;
    const wallArea = length * wallHeight;

    sum += wallArea * pricing.wallBasePricePerM2;

    const wallType = mapSurfaceToWallType(details[side]?.surface);
    if (wallType === "wood") sum += wallArea * (pricing.wallSurcharges.wood ?? 0);
    else if (wallType === "led") sum += wallArea * (pricing.wallSurcharges.led ?? 0);
    else if (wallType === "banner") sum += wallArea * (pricing.wallSurcharges.banner ?? 0);
  });

  const panelArea = Object.values(m.wallPanels ?? {})
    .filter((panel) => !!panel.locked)
    .reduce((acc, panel) => acc + panel.width * (panel.height ?? baseHeight), 0);
  const panelSurface = m.wallPanelRules?.defaultSurface;
  if (panelArea > 0 && panelSurface) {
    const wallType = mapSurfaceToWallType(panelSurface);
    if (wallType === "wood") sum += panelArea * (pricing.wallSurcharges.wood ?? 0);
    else if (wallType === "led") sum += panelArea * (pricing.wallSurcharges.led ?? 0);
    else if (wallType === "banner") sum += panelArea * (pricing.wallSurcharges.banner ?? 0);
  }

  return sum;
};

const calcFloorCost = (cfg, pricing) => {
  const m = cfg.modules;
  const floor = m.floor;
  if (!floor) return 0;

  const area = cfg.width * cfg.depth;
  let sum = 0;

  switch (floor.type) {
    case "laminate":
      sum += area * (pricing.floorSurchargePerM2.laminate ?? 0);
      break;
    case "vinyl":
      sum += area * (pricing.floorSurchargePerM2.vinyl ?? 0);
      break;
    case "wood":
      sum += area * (pricing.floorSurchargePerM2.wood ?? 0);
      break;
    default:
      break;
  }

  if (floor.raised) {
    sum += area * pricing.raisedFloorSurchargePerM2;
  }

  return sum;
};

const calcCabinCost = (cfg, pricing) => {
  const cabin = cfg.modules.cabin;
  if (!cabin || !cabin.enabled) return 0;

  const area = cabin.width * cabin.depth;
  let sum = area * pricing.cabinPricePerM2;

  const explicitDoors = cabin.doors?.length ?? 0;
  const hasLegacyDoor = cabin.doorSide != null;
  const doorCount = explicitDoors > 0 ? explicitDoors : hasLegacyDoor ? 1 : 0;
  if (doorCount > 0) {
    sum += doorCount * pricing.cabinDoorPrice;
  }

  if (cabin.height > 2.5) {
    const extraHeight = cabin.height - 2.5;
    sum *= 1 + extraHeight * 0.08;
  }

  return sum;
};

const calcDetailedScreensCost = (screens, pricing) => {
  let sum = 0;
  for (const s of screens) {
    if (typeof s.unitPrice === "number") {
      sum += s.unitPrice;
      continue;
    }

    const sizeKey = s.screenSize;
    if (sizeKey && pricing.screenPriceBySize[sizeKey]) {
      sum += pricing.screenPriceBySize[sizeKey];
      continue;
    }

    const width = s.size?.w ?? 0.9;
    const guessed = width > 1.1 ? "75" : width > 1 ? "65" : "55";
    sum += pricing.screenPriceBySize[guessed];
  }

  return sum;
};

const calcSeatingCost = (seating, pricing) => {
  if (!seating || seating.length === 0) return 0;
  return seating.reduce((acc, s) => {
    const base = pricing.seatingBasePrice[s.type];
    const cover = pricing.seatingCoverSurcharge[s.cover];
    return acc + s.count * (base + cover);
  }, 0);
};

const calcChairCost = (chairs, pricing) => {
  if (!chairs || chairs.length === 0) return 0;
  return chairs.reduce((sum, chair) => {
    if (chair.unitPrice != null) return sum + chair.unitPrice;
    const type = chair.type ?? "chair";
    const cover = chair.cover ?? "none";
    const base = pricing.seatingBasePrice[type] ?? pricing.seatingBasePrice.chair;
    const coverCost = pricing.seatingCoverSurcharge[cover] ?? 0;
    return sum + base + coverCost;
  }, 0);
};

const calcRoundTableCost = (tables, pricing) => {
  if (!tables || tables.length === 0) return 0;
  return tables.reduce((acc, table) => {
    if (typeof table.unitPrice === "number") return acc + table.unitPrice;
    return acc + pricing.roundTablePrice;
  }, 0);
};

const calcCustomObjectsCost = (custom) => {
  if (!custom || custom.length === 0) return 0;
  return custom.reduce((sum, obj) => {
    if (typeof obj.unitPrice === "number") return sum + obj.unitPrice;
    return sum;
  }, 0);
};

const calcWallLightsCost = (cfg, pricing) => {
  const m = cfg.modules;
  const detailed = m.wallLightsDetailed;
  if (Array.isArray(detailed) && detailed.length > 0) {
    return detailed.reduce((sum, light) => {
      const custom = typeof light.unitPrice === "number" ? light.unitPrice : pricing.wallLightPrice;
      return sum + custom;
    }, 0);
  }
  const legacyTotal = (m.wallLightsBack ?? 0) + (m.wallLightsLeft ?? 0) + (m.wallLightsRight ?? 0);
  return legacyTotal * pricing.wallLightPrice;
};

const calcDetailedCountersCost = (counters, defaultVariant, defaultWithPower, pricing) => {
  let sum = 0;
  for (const c of counters) {
    if (typeof c.unitPrice === "number") {
      sum += c.unitPrice;
      continue;
    }
    const variant = c.variant ?? defaultVariant ?? "basic";
    let base = pricing.counterPrices.basic;
    if (variant === "premium") base = pricing.counterPrices.premium;
    else if (variant === "corner") base = pricing.counterPrices.corner;
    sum += base;
    const withPower = c.withPower ?? defaultWithPower ?? false;
    if (withPower) sum += pricing.counterPowerSurcharge;
  }
  return sum;
};

const calcTrussCost = (cfg, pricing) => {
  const m = cfg.modules;
  const hasTrussFlag = !!m.truss || !!m.trussConfig?.enabled;
  if (!hasTrussFlag) return 0;

  const perimeter =
    m.trussConfig?.lengthX && m.trussConfig?.lengthZ
      ? 2 * (m.trussConfig.lengthX + m.trussConfig.lengthZ)
      : 2 * (cfg.width + cfg.depth);

  let sum = perimeter * pricing.trussMeterPrice;

  let attachmentLights = 0;
  let frames = 0;
  if (m.trussConfig?.attachments) {
    for (const att of m.trussConfig.attachments) {
      if (att.type === "light") attachmentLights += att.count;
      if (att.type === "bannerFrame") frames += att.count;
    }
  }

  const detailedLights = Array.isArray(m.trussLightsDetailed) ? m.trussLightsDetailed ?? [] : [];
  let lightCost = 0;
  if (detailedLights.length > 0) {
    lightCost = detailedLights.reduce((acc, light) => {
      const custom = typeof light.unitPrice === "number" ? light.unitPrice : pricing.trussLightPrice;
      return acc + custom;
    }, 0);
  } else {
    const splitLights =
      (m.trussLightsFront ?? 0) +
      (m.trussLightsBack ?? 0) +
      (m.trussLightsLeft ?? 0) +
      (m.trussLightsRight ?? 0);
    const legacyLights = m.trussLights ?? 0;
    lightCost = (splitLights + legacyLights) * pricing.trussLightPrice;
  }

  if (attachmentLights > 0) {
    lightCost += attachmentLights * pricing.trussLightPrice;
  }

  const splitFrames =
    (m.trussBannersFront ?? 0) +
    (m.trussBannersBack ?? 0) +
    (m.trussBannersLeft ?? 0) +
    (m.trussBannersRight ?? 0);
  frames += splitFrames;
  sum += frames * pricing.trussBannerFramePrice;
  sum += lightCost;

  const resolvedTrussHeight = cfg.traverseHeight ?? cfg.modules.trussHeight;
  if (resolvedTrussHeight && resolvedTrussHeight > 4) {
    const extraH = resolvedTrussHeight - 4;
    sum *= 1 + extraH * 0.05;
  }

  return sum;
};

const calcAdvancedModuleCost = (cfg, pricing) => {
  let sum = 0;
  sum += calcAdvancedWallsCost(cfg, pricing);
  sum += calcFloorCost(cfg, pricing);
  sum += calcCabinCost(cfg, pricing);
  if (cfg.modules.detailedScreens && cfg.modules.detailedScreens.length > 0) {
    sum += calcDetailedScreensCost(cfg.modules.detailedScreens, pricing);
  }
  if (cfg.modules.countersDetailed && cfg.modules.countersDetailed.length > 0) {
    sum += calcDetailedCountersCost(
      cfg.modules.countersDetailed,
      cfg.modules.counterVariant,
      cfg.modules.countersWithPower,
      pricing
    );
  }
  sum += calcSeatingCost(cfg.modules.seating, pricing);
  sum += calcChairCost(cfg.modules.chairsDetailed, pricing);
  sum += calcRoundTableCost(cfg.modules.roundTables, pricing);
  sum += calcCustomObjectsCost(cfg.modules.customObjects);
  sum += calcTrussCost(cfg, pricing);
  sum += calcWallLightsCost(cfg, pricing);
  return sum;
};

export const calcPrice = (cfg, pricingModel, options = {}) => {
  const mergedModel = mergePricingModel(pricingModel);
  const pricing = resolvePricing(mergedModel);
  const customer = resolveCustomerMultiplier(
    mergedModel,
    options.customerId,
    options.customerMultiplier
  );

  const area = cfg.width * cfg.depth;
  const materialCost = area * pricing.baseMaterialPerM2;
  const laborCost = calcLaborCost(area, pricing);
  const legacyModules = calcLegacyModuleCost(cfg, area, pricing);
  const advancedModules = calcAdvancedModuleCost(cfg, pricing);
  const moduleCost = legacyModules + advancedModules;
  const travelCost = pricing.travelCostMap[cfg.region] ?? 0;

  let sum = materialCost + laborCost + moduleCost + travelCost;
  sum *= pricing.regionFactorMap[cfg.region] ?? 1;
  if (cfg.rush) {
    sum *= 1 + pricing.rushSurchargePercent;
  }
  sum *= 1 + pricing.safetyMarginPercent;
  sum *= customer.multiplier;

  return Math.round(sum);
};
