import * as THREE from "three";
import type { StandConfig as PricingStandConfig, WallSide } from "../lib/pricing";

export type StandConfig = PricingStandConfig;

export type StandSceneObjects = {
  basePlate: THREE.Mesh;
  raisedFloor?: THREE.Mesh;
  floor: THREE.Mesh;
  walls: THREE.Mesh[];
  cabin?: THREE.Group;
  counters: THREE.Group[];
  countersDetailed: { id: string; group: THREE.Group }[];
  screensDetailed: { id: string; group: THREE.Object3D }[];
  ledFrames: THREE.Mesh[];
  ledWall?: THREE.Mesh;
  truss?: THREE.Group;
  trussLights: THREE.Object3D[];
  trussBanners: THREE.Mesh[];
  wallLights: THREE.PointLight[];
};

type CounterVariant = "basic" | "premium" | "corner";

type DetailedCounter = {
  id: string;
  variant?: CounterVariant;
  size?: { w: number; d: number; h?: number };
  position: { x: number; z: number; y?: number };
  rotationY?: number;
};

type DetailedScreen = {
  id: string;
  size?: { w: number; h: number; t?: number };
  mount?: "wall" | "truss" | "floor";
  wallSide?: WallSide;
  heightFromFloor?: number;
  position: { x: number; z: number };
  rotationY?: number;
};

function makePlane({
  size,
  color,
  rotation = new THREE.Euler(-Math.PI / 2, 0, 0),
  position = new THREE.Vector3(),
}: {
  size: [number, number];
  color: string;
  rotation?: THREE.Euler;
  position?: THREE.Vector3;
}) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size[0], size[1]),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.rotation.copy(rotation);
  mesh.position.copy(position);
  mesh.receiveShadow = true;
  return mesh;
}

function makeBox({
  size,
  material,
  position = new THREE.Vector3(),
}: {
  size: [number, number, number];
  material: THREE.MeshStandardMaterialParameters;
  position?: THREE.Vector3;
}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial(material)
  );
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildCounter(variant: CounterVariant, dims: { w: number; d: number; h: number }) {
  const group = new THREE.Group();
  const { w, d, h } = dims;

  if (variant === "basic") {
    const mesh = makeBox({
      size: [w, h, d],
      material: { color: "#1d4ed8", roughness: 0.35, metalness: 0.45 },
      position: new THREE.Vector3(0, h / 2, 0),
    });
    group.add(mesh);
    return group;
  }

  if (variant === "premium") {
    const base = makeBox({
      size: [Math.max(w, 1.4), h, Math.max(d, 0.6)],
      material: { color: "#0f172a", roughness: 0.4, metalness: 0.6 },
      position: new THREE.Vector3(0, h / 2, 0),
    });
    const accent = makeBox({
      size: [1.2, 0.5, 0.02],
      material: { color: "#1d4ed8", roughness: 0.2, metalness: 0.7 },
      position: new THREE.Vector3(0, h * 0.55, Math.max(d, 0.6) / 2 - 0.29),
    });
    const top = makeBox({
      size: [Math.max(w, 1.45), 0.06, Math.max(d, 0.65)],
      material: { color: "#e5e7eb", roughness: 0.2, metalness: 0.3 },
      position: new THREE.Vector3(0, h + 0.02, 0),
    });
    group.add(base, accent, top);
    return group;
  }

  const bodyA = makeBox({
    size: [w, h, d],
    material: { color: "#1e293b", roughness: 0.5, metalness: 0.35 },
    position: new THREE.Vector3(-w / 2 + w * 0.5, h / 2, 0),
  });
  const bodyB = makeBox({
    size: [d, h, w],
    material: { color: "#1e293b", roughness: 0.5, metalness: 0.35 },
    position: new THREE.Vector3(0, h / 2, -d / 2 + d * 0.5),
  });
  const topPlate = makeBox({
    size: [1.2, 0.06, 1.2],
    material: { color: "#e5e7eb", roughness: 0.3, metalness: 0.3 },
    position: new THREE.Vector3(-0.2, h + 0.02, -0.2),
  });
  group.add(bodyA, bodyB, topPlate);
  return group;
}

function buildScreen({ w, h, t }: { w: number; h: number; t: number }) {
  return makeBox({
    size: [w, h, t],
    material: { color: "#020617", roughness: 0.2, metalness: 0.7 },
  });
}

function wallMaterial(surface: string): THREE.MeshStandardMaterialParameters {
  switch (surface) {
    case "wood":
      return { color: "#a16207", roughness: 0.5, metalness: 0.2 };
    case "banner":
      return { color: "#0ea5e9", roughness: 0.65, metalness: 0.1 };
    case "seg":
      return { color: "#f3f4f6", roughness: 0.85, metalness: 0.05 };
    case "led":
      return {
        color: "#0f172a",
        roughness: 0.35,
        metalness: 0.15,
        emissive: "#38bdf8",
        emissiveIntensity: 0.9,
      };
    case "system":
    default:
      return { color: "#e5e7eb", roughness: 0.9, metalness: 0.05 };
  }
}

function buildCabin({ width, depth, height }: { width: number; depth: number; height: number }) {
  const cabin = new THREE.Group();
  const body = makeBox({
    size: [width, height, depth],
    material: { color: "#d1d5db", roughness: 0.9, metalness: 0.05 },
    position: new THREE.Vector3(0, height / 2, 0),
  });
  cabin.add(body);
  return cabin;
}

export function createStandScene(
  config: StandConfig
): { scene: THREE.Scene; camera: THREE.PerspectiveCamera; objects: StandSceneObjects } {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

  const { width, depth, height, modules } = config;

  const objects: StandSceneObjects = {
    basePlate: new THREE.Mesh(),
    floor: new THREE.Mesh(),
    walls: [],
    counters: [],
    countersDetailed: [],
    screensDetailed: [],
    ledFrames: [],
    trussLights: [],
    trussBanners: [],
    wallLights: [],
  };

  const mAny = modules as any;
  const wallsClosedSides: number = mAny.wallsClosedSides ?? 1;
  const wallHeight = height;
  const wallThickness = 0.06;
  const panelGap = 0.01;
  const floorConfig = modules.floor;
  const isRaised = floorConfig?.raised ?? modules.raisedFloor ?? false;
  const floorHeight = isRaised ? 0.08 : 0.025;

  // base plate
  objects.basePlate = makePlane({
    size: [width + 0.4, depth + 0.4],
    color: "#020617",
    position: new THREE.Vector3(0, 0, 0),
  });
  objects.basePlate.castShadow = false;
  objects.basePlate.receiveShadow = false;
  scene.add(objects.basePlate);

  // raised floor
  if (isRaised) {
    objects.raisedFloor = makeBox({
      size: [width, floorHeight, depth],
      material: { color: "#020617", roughness: 0.6, metalness: 0.2 },
      position: new THREE.Vector3(0, floorHeight / 2, 0),
    });
    scene.add(objects.raisedFloor);
  }

  // floor plane
  const floorMaterial = (floorConfig as any)?.material ?? "grey";
  const floorMaterialMap: Record<string, THREE.MeshStandardMaterialParameters> = {
    grey: { color: "#e5e7eb", roughness: 0.9, metalness: 0.05 },
    blue: { color: "#0ea5e9", roughness: 0.6, metalness: 0.2 },
    dark: { color: "#0f172a", roughness: 0.6, metalness: 0.2 },
    wood: { color: "#854d0e", roughness: 0.7, metalness: 0.15 },
  };
  const fm = floorMaterialMap[floorMaterial] ?? floorMaterialMap.grey;
  objects.floor = makePlane({
    size: [width, depth],
    color: fm.color as string,
    position: new THREE.Vector3(0, floorHeight + 0.001, 0),
  });
  (objects.floor.material as THREE.MeshStandardMaterial).roughness = fm.roughness ?? 0.8;
  (objects.floor.material as THREE.MeshStandardMaterial).metalness = fm.metalness ?? 0.1;
  scene.add(objects.floor);

  // walls
  const wallCenterY = floorHeight + wallHeight / 2;
  const surfaces = mAny.wallSurfaces || {};

  const backSurface = wallMaterial(surfaces.back ?? "system");
  const leftSurface = wallMaterial(surfaces.left ?? "system");
  const rightSurface = wallMaterial(surfaces.right ?? "system");

  if (wallsClosedSides >= 1) {
    const backWall = makeBox({
      size: [width, wallHeight, 0.06],
      material: backSurface,
      position: new THREE.Vector3(0, wallCenterY, -depth / 2 + 0.06 / 2),
    });
    scene.add(backWall);
    objects.walls.push(backWall);
  }
  if (wallsClosedSides >= 2) {
    const leftWall = makeBox({
      size: [0.06, wallHeight, depth],
      material: leftSurface,
      position: new THREE.Vector3(-width / 2 + 0.06 / 2, wallCenterY, 0),
    });
    scene.add(leftWall);
    objects.walls.push(leftWall);
  }
  if (wallsClosedSides >= 3) {
    const rightWall = makeBox({
      size: [0.06, wallHeight, depth],
      material: rightSurface,
      position: new THREE.Vector3(width / 2 - 0.06 / 2, wallCenterY, 0),
    });
    scene.add(rightWall);
    objects.walls.push(rightWall);
  }

  // cabin
  const cabin = mAny.cabin;
  if (cabin?.enabled) {
    const cabinGroup = buildCabin({
      width: cabin.width ?? 1.5,
      depth: cabin.depth ?? 1.5,
      height: cabin.height ?? 2.2,
    });
    const cabinPosX = cabin.position?.x ?? -width / 2 + (cabin.width ?? 1.5) / 2 + 0.25;
    const cabinPosZ = cabin.position?.z ?? -depth / 2 + (cabin.depth ?? 1.5) / 2 + 0.25;
    cabinGroup.position.set(cabinPosX, floorHeight, cabinPosZ);
    scene.add(cabinGroup);
    objects.cabin = cabinGroup;
  }

  // truss
  if (mAny.truss) {
    const defaultTrussHeight = floorHeight + wallHeight + 0.5;
    const trussHeight = Math.max(
      defaultTrussHeight,
      typeof mAny.trussHeight === "number" ? mAny.trussHeight : defaultTrussHeight
    );
    const trussGroup = new THREE.Group();

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: "#94a3b8",
      roughness: 0.65,
      metalness: 0.35,
    });
    const beamThickness = 0.08;
    const spanX = width;
    const spanZ = depth;

    const topY = trussHeight;
    const yBottom = floorHeight + wallHeight;

    const beams: Array<[number, number, number, number, number, number]> = [
      [0, topY, -spanZ / 2 + beamThickness / 2, spanX, beamThickness, beamThickness],
      [0, topY, spanZ / 2 - beamThickness / 2, spanX, beamThickness, beamThickness],
      [-spanX / 2 + beamThickness / 2, topY, 0, beamThickness, beamThickness, spanZ],
      [spanX / 2 - beamThickness / 2, topY, 0, beamThickness, beamThickness, spanZ],
    ];

    beams.forEach(([x, y, z, w, h, d]) => {
      const beam = makeBox({
        size: [w, h, d],
        material: frameMaterial,
        position: new THREE.Vector3(x, y, z),
      });
      trussGroup.add(beam);
    });

    const posts: Array<[number, number, number]> = [
      [-spanX / 2 + beamThickness / 2, yBottom, -spanZ / 2 + beamThickness / 2],
      [spanX / 2 - beamThickness / 2, yBottom, -spanZ / 2 + beamThickness / 2],
      [-spanX / 2 + beamThickness / 2, yBottom, spanZ / 2 - beamThickness / 2],
      [spanX / 2 - beamThickness / 2, yBottom, spanZ / 2 - beamThickness / 2],
    ];
    posts.forEach(([x, _y, z]) => {
      const post = makeBox({
        size: [beamThickness, topY - yBottom, beamThickness],
        material: frameMaterial,
        position: new THREE.Vector3(x, (topY + yBottom) / 2, z),
      });
      trussGroup.add(post);
    });

    trussGroup.position.set(mAny.trussOffset?.x ?? 0, 0, mAny.trussOffset?.z ?? 0);
    scene.add(trussGroup);
    objects.truss = trussGroup;

    const trussLightType: "spot" | "wash" = (mAny.trussLightType ?? "spot") as "spot" | "wash";
    const lightCount = {
      front: mAny.trussLightsFront ?? 0,
      back: mAny.trussLightsBack ?? 0,
      left: mAny.trussLightsLeft ?? 0,
      right: mAny.trussLightsRight ?? 0,
    };

    const addTrussLight = (
      key: string,
      x: number,
      z: number,
      lx: number,
      lz: number,
      flipY = false
    ) => {
      const lightY = trussHeight - 0.1;
      const group = new THREE.Group();
      let lightMesh: THREE.Mesh;
      if (trussLightType === "spot") {
        lightMesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.07, 0.12, 10),
          new THREE.MeshStandardMaterial({
            color: "#facc15",
            emissive: "#facc15",
            emissiveIntensity: 1.2,
            roughness: 0.4,
          })
        );
      } else {
        lightMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.08, 0.1),
          new THREE.MeshStandardMaterial({
            color: "#fde68a",
            emissive: "#fbbf24",
            emissiveIntensity: 0.9,
            roughness: 0.35,
            metalness: 0.4,
          })
        );
      }
      lightMesh.position.set(x, lightY, z);
      if (flipY) lightMesh.rotation.y = Math.PI;
      const point = new THREE.PointLight("#fef3c7", 1.1, 6, 2);
      point.position.set(lx, lightY - 0.05, lz);
      group.add(lightMesh, point);
      group.name = key;
      objects.trussLights.push(group);
      trussGroup.add(group);
    };

    const lightSpacing = (span: number, count: number) => (count > 0 ? span / (count + 1) : 0);
    const frontSpacing = lightSpacing(width, lightCount.front);
    const backSpacing = lightSpacing(width, lightCount.back);
    const leftSpacing = lightSpacing(depth, lightCount.left);
    const rightSpacing = lightSpacing(depth, lightCount.right);

    for (let i = 0; i < lightCount.front; i++) {
      const x = -width / 2 + frontSpacing * (i + 1);
      addTrussLight(`truss-front-${i}`, x, -depth / 2, x, -depth / 2 + 0.6, false);
    }
    for (let i = 0; i < lightCount.back; i++) {
      const x = -width / 2 + backSpacing * (i + 1);
      addTrussLight(`truss-back-${i}`, x, depth / 2, x, depth / 2 - 0.6, true);
    }
    for (let i = 0; i < lightCount.left; i++) {
      const z = -depth / 2 + leftSpacing * (i + 1);
      addTrussLight(`truss-left-${i}`, -width / 2, z, -width / 2 + 0.6, z, false);
    }
    for (let i = 0; i < lightCount.right; i++) {
      const z = -depth / 2 + rightSpacing * (i + 1);
      addTrussLight(`truss-right-${i}`, width / 2, z, width / 2 - 0.6, z, true);
    }

    const bannerWidth: number = mAny.trussBannerWidth ?? 3;
    const bannerHeight: number = mAny.trussBannerHeight ?? 1;
    const bannerThickness = 0.04;
    const bannerMaterial = new THREE.MeshStandardMaterial({
      color: "#e2e8f0",
      roughness: 0.8,
      metalness: 0.05,
    });

    const bannerCounts = {
      front: mAny.trussBannersFront ?? 0,
      back: mAny.trussBannersBack ?? 0,
      left: mAny.trussBannersLeft ?? 0,
      right: mAny.trussBannersRight ?? 0,
    };

    const addBanner = (key: string, position: THREE.Vector3, rotationY: number) => {
      const mesh = makeBox({
        size: [bannerWidth, bannerHeight, bannerThickness],
        material: bannerMaterial,
        position,
      });
      mesh.rotation.y = rotationY;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = key;
      objects.trussBanners.push(mesh);
      trussGroup.add(mesh);
    };

    const bannerY = trussHeight - bannerHeight / 2;
    const frontBannerSpacing = lightSpacing(width, bannerCounts.front);
    for (let i = 0; i < bannerCounts.front; i++) {
      const x = -width / 2 + frontBannerSpacing * (i + 1);
      addBanner(`banner-front-${i}`, new THREE.Vector3(x, bannerY, -depth / 2 + bannerThickness / 2), 0);
    }
    for (let i = 0; i < bannerCounts.back; i++) {
      const x = -width / 2 + frontBannerSpacing * (i + 1);
      addBanner(`banner-back-${i}`, new THREE.Vector3(x, bannerY, depth / 2 - bannerThickness / 2), Math.PI);
    }
    const leftBannerSpacing = lightSpacing(depth, bannerCounts.left);
    for (let i = 0; i < bannerCounts.left; i++) {
      const z = -depth / 2 + leftBannerSpacing * (i + 1);
      addBanner(
        `banner-left-${i}`,
        new THREE.Vector3(-width / 2 + bannerThickness / 2, bannerY, z),
        Math.PI / 2
      );
    }
    for (let i = 0; i < bannerCounts.right; i++) {
      const z = -depth / 2 + leftBannerSpacing * (i + 1);
      addBanner(
        `banner-right-${i}`,
        new THREE.Vector3(width / 2 - bannerThickness / 2, bannerY, z),
        -Math.PI / 2
      );
    }
  }

  // wall lights
  const addWallLights = (count: number, side: WallSide) => {
    if (!count) return;
    const lights: THREE.PointLight[] = [];
    const spacing = (side === "back" ? width : depth) / (count + 1);
    for (let i = 0; i < count; i++) {
      const pos = new THREE.PointLight("#fef3c7", 0.8, 4, 2);
      if (side === "back") {
        pos.position.set(-width / 2 + spacing * (i + 1), floorHeight + wallHeight * 0.6, -depth / 2 + 0.05);
      } else if (side === "left") {
        pos.position.set(-width / 2 + 0.05, floorHeight + wallHeight * 0.6, -depth / 2 + spacing * (i + 1));
      } else {
        pos.position.set(width / 2 - 0.05, floorHeight + wallHeight * 0.6, -depth / 2 + spacing * (i + 1));
      }
      lights.push(pos);
      scene.add(pos);
    }
    objects.wallLights.push(...lights);
  };

  addWallLights(mAny.wallLightsBack ?? 0, "back");
  addWallLights(mAny.wallLightsLeft ?? 0, "left");
  addWallLights(mAny.wallLightsRight ?? 0, "right");

  // led frames
  const ledFramesCount = mAny.ledFrames ?? 0;
  if (ledFramesCount > 0) {
    const ledSize = { w: 1, h: 2.2, t: 0.08 };
    const gap = 0.2;
    for (let i = 0; i < ledFramesCount; i++) {
      const frame = makeBox({
        size: [ledSize.w, ledSize.h, ledSize.t],
        material: {
          color: "#0f172a",
          emissive: "#22d3ee",
          emissiveIntensity: 1.1,
          roughness: 0.35,
        },
        position: new THREE.Vector3(
          -width / 2 + ledSize.w / 2 + gap + i * (ledSize.w + gap),
          floorHeight + ledSize.h / 2,
          -depth / 2 + ledSize.t / 2
        ),
      });
      objects.ledFrames.push(frame);
      scene.add(frame);
    }
  }

  // led wall
  if (mAny.ledWall) {
    const led = makeBox({
      size: [width, wallHeight * 0.6, 0.1],
      material: { color: "#0f172a", emissive: "#38bdf8", emissiveIntensity: 0.8, roughness: 0.4 },
      position: new THREE.Vector3(0, floorHeight + wallHeight * 0.3, -depth / 2 + 0.08),
    });
    objects.ledWall = led;
    scene.add(led);
  }

  // counters quick placement
  const counters = mAny.counters ?? 0;
  const countersWall: "front" | "island" = (mAny.countersWall ?? "front") as any;
  const counterVariant: CounterVariant = (mAny.counterVariant ?? "basic") as CounterVariant;
  for (let i = 0; i < counters; i++) {
    const ctr = buildCounter(counterVariant, { w: 0.9, d: 0.5, h: 1.1 });
    const spacing = (countersWall === "front" ? width : depth) / (counters + 1);
    if (countersWall === "front") {
      ctr.position.set(-width / 2 + spacing * (i + 1), floorHeight, depth / 2 - 0.5);
    } else {
      ctr.position.set(0, floorHeight, -depth / 2 + spacing * (i + 1));
    }
    objects.counters.push(ctr);
    scene.add(ctr);
  }

  // detailed counters
  const countersDetailed = (mAny.countersDetailed ?? []) as DetailedCounter[];
  countersDetailed.forEach((ctr) => {
    const dims = {
      w: ctr.size?.w ?? 0.9,
      d: ctr.size?.d ?? 0.5,
      h: ctr.size?.h ?? 1.1,
    };
    const group = buildCounter((ctr.variant ?? counterVariant) as CounterVariant, dims);
    group.position.set(ctr.position.x ?? 0, (ctr.position.y ?? 0) + floorHeight, ctr.position.z ?? 0);
    if (ctr.rotationY) group.rotation.y = ctr.rotationY;
    objects.countersDetailed.push({ id: ctr.id, group });
    scene.add(group);
  });

  // detailed screens
  const screensDetailed = (mAny.detailedScreens ?? []) as DetailedScreen[];
  const screensWallSide = (mAny.screensWall as WallSide) ?? "back";
  const backWallFrontZ = -depth / 2 + wallThickness + panelGap;
  const leftWallInnerX = -width / 2 + wallThickness + panelGap;
  const rightWallInnerX = width / 2 - wallThickness - panelGap;

  if (screensDetailed.length === 0 && (mAny.screens ?? 0) > 0) {
    const total = mAny.screens as number;
    for (let idx = 0; idx < total; idx++) {
      let x = 0;
      let z = 0;
      const wall: WallSide = screensWallSide;
      if (wall === "back") {
        const spacing = width / (total + 1);
        x = -width / 2 + spacing * (idx + 1);
        z = backWallFrontZ;
      } else if (wall === "left") {
        const spacing = depth / (total + 1);
        z = -depth / 2 + spacing * (idx + 1);
        x = leftWallInnerX;
      } else {
        const spacing = depth / (total + 1);
        z = -depth / 2 + spacing * (idx + 1);
        x = rightWallInnerX;
      }
      screensDetailed.push({
        id: `scr-${Date.now()}-${idx}`,
        size: { w: 0.9, h: 0.55, t: 0.02 },
        mount: "wall",
        wallSide: wall,
        heightFromFloor: floorHeight + 1.6,
        position: { x, z },
        rotationY: wall === "left" ? Math.PI / 2 : wall === "right" ? -Math.PI / 2 : 0,
      });
    }
  }

  screensDetailed.forEach((scr) => {
    const size = {
      w: scr.size?.w ?? 0.9,
      h: scr.size?.h ?? 0.55,
      t: scr.size?.t ?? 0.02,
    };
    const panel = buildScreen(size);
    const y = scr.heightFromFloor ?? floorHeight + 1.6;
    panel.position.set(scr.position.x ?? 0, y, scr.position.z ?? 0);
    if (scr.rotationY) panel.rotation.y = scr.rotationY;
    objects.screensDetailed.push({ id: scr.id, group: panel });
    scene.add(panel);
  });

  return { scene, camera, objects };
}
