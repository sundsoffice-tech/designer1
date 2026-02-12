export type Vec3 = { x: number; y: number; z: number };

export type TrussProfile = {
  id: string;
  /** Standard length of a single segment in meters (e.g. 0.5 or 1.0). */
  length: number;
  /** Outer width/height of the square cross section in meters (e.g. 0.29). */
  crossSection: number;
  /** Optional helper for validation/UX: maximum free span before a support post is required. */
  maxSpanWithoutSupport?: number;
  /** Arbitrary metadata hook for future extensions (manufacturer, weight, etc.). */
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type TrussSegment = {
  id?: string;
  profileId: string;
  from: Vec3;
  to: Vec3;
  /**
   * Normalized direction of the segment. Optional because it can be derived
   * from from/to, but keeping it allows caching/preprocessing.
   */
  orientation?: Vec3;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type TrussMountingType = "hanging" | "onPosts" | "wallAttached";

export type TrussAttachmentPoint = {
  id: string;
  position: Vec3;
  /** Optional reference to the segment this attachment belongs to. */
  segmentId?: string;
  /** Distance from segment start in meters. */
  offset?: number;
  /** Semantic tag to differentiate lights, banners, rigging, etc. */
  type?: "light" | "banner" | "generic";
};

export type TrussLayout = {
  id: string;
  segments: TrussSegment[];
  mountingType: TrussMountingType;
  /** Absolute height above ground in meters. */
  height: number;
  /** Grid size used for snapping positions/lengths. */
  gridSnap?: number;
  /** Available profiles for this layout. */
  profiles?: Record<string, TrussProfile>;
  /** Optional precomputed attachment points along the segments. */
  attachments?: TrussAttachmentPoint[];
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

const DEFAULT_GRID = 0.5;

export function snapToGrid(value: number, grid = DEFAULT_GRID): number {
  const snap = grid > 0 ? grid : DEFAULT_GRID;
  return Math.round(value / snap) * snap;
}

export function snapPointToGrid(point: Vec3, grid = DEFAULT_GRID): Vec3 {
  return {
    x: snapToGrid(point.x, grid),
    y: snapToGrid(point.y, grid),
    z: snapToGrid(point.z, grid),
  };
}

export function inferOrientation(segment: TrussSegment): Vec3 {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const dz = segment.to.z - segment.from.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return { x: 0, y: 1, z: 0 };
  return { x: dx / len, y: dy / len, z: dz / len };
}

/**
 * Generates evenly spaced attachment points for all segments in a layout.
 * The spacing defaults to the layout gridSnap (or 0.5 m), so the result
 * can be reused for lights, banners or snap targets in the editor.
 */
export function buildAttachmentPoints(
  layout: TrussLayout,
  interval?: number
): TrussAttachmentPoint[] {
  const snap = interval && interval > 0 ? interval : layout.gridSnap ?? DEFAULT_GRID;
  const attachments: TrussAttachmentPoint[] = [];

  layout.segments.forEach((segment, index) => {
    const dir = inferOrientation(segment);
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const dz = segment.to.z - segment.from.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(length) || length < 1e-4) return;

    const steps = Math.max(1, Math.floor(length / snap));
    for (let i = 0; i <= steps; i += 1) {
      const dist = Math.min(length, i * snap);
      const position: Vec3 = {
        x: segment.from.x + dir.x * dist,
        y: segment.from.y + dir.y * dist,
        z: segment.from.z + dir.z * dist,
      };
      attachments.push({
        id: `${segment.id ?? `seg-${index}`}-att-${i}`,
        position,
        segmentId: segment.id,
        offset: dist,
        type: "generic",
      });
    }
  });

  return attachments;
}

export function applyGridSnap(layout: TrussLayout): TrussLayout {
  const grid = layout.gridSnap ?? DEFAULT_GRID;
  return {
    ...layout,
    segments: layout.segments.map((segment) => ({
      ...segment,
      from: snapPointToGrid(segment.from, grid),
      to: snapPointToGrid(segment.to, grid),
    })),
  };
}
