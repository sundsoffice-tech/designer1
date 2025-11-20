import type { StandConfig } from "./pricing";

/**
 * Manuelle Prüfkonfiguration für Kollisionen.
 * Mehrere Counters/Screens dicht beieinander + Kabine + Truss.
 */
export const collisionPlayground: StandConfig = {
  width: 6,
  depth: 4,
  height: 2.5,
  type: "corner",
  region: "NRW",
  rush: false,
  modules: {
    wallsClosedSides: 2,
    storageRoom: true,
    storageDoorSide: "left",
    ledFrames: 1,
    ledWall: "back",
    counters: 0,
    countersWithPower: true,
    counterVariant: "premium",
    countersDetailed: [
      {
        id: "ctr-demo-1",
        variant: "premium",
        withPower: true,
        size: { w: 1.4, d: 0.6, h: 1.1 },
        position: { x: -1.4, z: 1.2 },
      },
      {
        id: "ctr-demo-2",
        variant: "basic",
        withPower: true,
        size: { w: 0.9, d: 0.5, h: 1.1 },
        position: { x: -0.1, z: 1.3 },
      },
      {
        id: "ctr-demo-3",
        variant: "corner",
        withPower: false,
        size: { w: 1.2, d: 0.9, h: 1.1 },
        position: { x: 1.3, z: 0.9 },
      },
    ],
    screens: 0,
    detailedScreens: [
      {
        id: "scr-demo-back",
        mount: "wall",
        wallSide: "back",
        size: { w: 1.2, h: 0.7, t: 0.06 },
        position: { x: 0, z: -1.9 },
      },
      {
        id: "scr-demo-floor",
        mount: "floor",
        size: { w: 1, h: 0.6, t: 0.12 },
        position: { x: 1.2, z: -0.8 },
      },
    ],
    truss: true,
    trussHeight: 3.2,
    trussOffset: { x: 0.4, z: 0.2 },
    trussLightsFront: 2,
    trussLightsLeft: 1,
    trussLightsRight: 1,
    trussLightType: "spot",
    trussBannersFront: 1,
    trussBannerWidth: 3,
    trussBannerHeight: 1,
    floor: {
      type: "carpet",
      raised: false,
    },
    collisionClearance: 0.25,
    cabin: {
      enabled: true,
      width: 2,
      depth: 1.6,
      height: 2.5,
      doorSide: "front",
      position: { x: -1.6, z: -1.2 },
    },
  } as any,
};
