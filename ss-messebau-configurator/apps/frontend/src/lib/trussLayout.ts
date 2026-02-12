import {
  TrussLayout,
  TrussMountingType,
  TrussProfile,
  TrussSegment,
  Vec3,
  applyGridSnap,
  buildAttachmentPoints,
} from "@ss/shared";

type LayoutOptions = {
  height?: number;
  gridSnap?: number;
  mountingType?: TrussMountingType;
  profile?: TrussProfile;
  offset?: { x?: number; z?: number };
  withAttachments?: boolean;
  id?: string;
};

const DEFAULT_HEIGHT = 3.5;
const DEFAULT_GRID_SNAP = 0.5;

export const DEFAULT_TRUSS_PROFILE: TrussProfile = {
  id: "fd34",
  length: 1,
  crossSection: 0.29,
  maxSpanWithoutSupport: 8,
};

const makePoint = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const finalizeLayout = (layout: TrussLayout, withAttachments: boolean): TrussLayout => {
  const snapped = applyGridSnap(layout);
  return withAttachments
    ? { ...snapped, attachments: buildAttachmentPoints(snapped) }
    : snapped;
};

const resolveOptions = (options?: LayoutOptions) => {
  const gridSnap = options?.gridSnap ?? DEFAULT_GRID_SNAP;
  const height = options?.height ?? DEFAULT_HEIGHT;
  const mountingType = options?.mountingType ?? "hanging";
  const profile = options?.profile ?? DEFAULT_TRUSS_PROFILE;
  const offset = options?.offset ?? { x: 0, z: 0 };
  const withAttachments = options?.withAttachments ?? true;
  const id = options?.id;

  return { gridSnap, height, mountingType, profile, offset, withAttachments, id };
};

const segment = (id: string, profileId: string, from: Vec3, to: Vec3): TrussSegment => ({
  id,
  profileId,
  from,
  to,
});

export function rectOverStand(
  standWidth: number,
  standDepth: number,
  options?: LayoutOptions
): TrussLayout {
  const { gridSnap, height, mountingType, profile, offset, withAttachments, id } = resolveOptions(options);
  const halfW = standWidth / 2;
  const halfD = standDepth / 2;
  const y = height;
  const ox = offset.x ?? 0;
  const oz = offset.z ?? 0;

  const segments: TrussSegment[] = [
    segment("front", profile.id, makePoint(-halfW + ox, y, halfD + oz), makePoint(halfW + ox, y, halfD + oz)),
    segment("back", profile.id, makePoint(-halfW + ox, y, -halfD + oz), makePoint(halfW + ox, y, -halfD + oz)),
    segment("left", profile.id, makePoint(-halfW + ox, y, -halfD + oz), makePoint(-halfW + ox, y, halfD + oz)),
    segment("right", profile.id, makePoint(halfW + ox, y, -halfD + oz), makePoint(halfW + ox, y, halfD + oz)),
  ];

  return finalizeLayout(
    {
      id: id ?? `rect-${standWidth}x${standDepth}`,
      segments,
      profiles: { [profile.id]: profile },
      mountingType,
      height,
      gridSnap,
    },
    withAttachments
  );
}

export function uShapeFrontOpen(
  standWidth: number,
  standDepth: number,
  options?: LayoutOptions
): TrussLayout {
  const { gridSnap, height, mountingType, profile, offset, withAttachments, id } = resolveOptions(options);
  const halfW = standWidth / 2;
  const halfD = standDepth / 2;
  const y = height;
  const ox = offset.x ?? 0;
  const oz = offset.z ?? 0;

  const segments: TrussSegment[] = [
    segment("back", profile.id, makePoint(-halfW + ox, y, -halfD + oz), makePoint(halfW + ox, y, -halfD + oz)),
    segment("left", profile.id, makePoint(-halfW + ox, y, -halfD + oz), makePoint(-halfW + ox, y, halfD + oz)),
    segment("right", profile.id, makePoint(halfW + ox, y, -halfD + oz), makePoint(halfW + ox, y, halfD + oz)),
  ];

  return finalizeLayout(
    {
      id: id ?? `u-open-${standWidth}x${standDepth}`,
      segments,
      profiles: { [profile.id]: profile },
      mountingType,
      height,
      gridSnap,
    },
    withAttachments
  );
}

export function bridgeOverFront(width: number, options?: LayoutOptions): TrussLayout {
  const { gridSnap, height, mountingType, profile, offset, withAttachments, id } = resolveOptions(options);
  const halfW = width / 2;
  const y = height;
  const ox = offset.x ?? 0;
  const oz = offset.z ?? 0;

  const segments: TrussSegment[] = [
    segment("bridge", profile.id, makePoint(-halfW + ox, y, oz), makePoint(halfW + ox, y, oz)),
  ];

  return finalizeLayout(
    {
      id: id ?? `bridge-${width}`,
      segments,
      profiles: { [profile.id]: profile },
      mountingType,
      height,
      gridSnap,
    },
    withAttachments
  );
}

export function mergeAttachmentPoints(layout: TrussLayout, spacing?: number): TrussLayout {
  const withGrid = applyGridSnap(layout);
  return {
    ...withGrid,
    attachments: buildAttachmentPoints(withGrid, spacing ?? withGrid.gridSnap),
  };
}
