import type { ScenarioV1 } from "./model";

type Point = { x: number; y: number };
type Viewport = Point & { zoom: number };
type FrameOrigin = { left: number; top: number };

export interface VideoCameraCue {
  atMs: number;
  viewport: Viewport;
}

export interface VideoCameraTrack {
  cues: VideoCameraCue[];
}

interface CameraEdge {
  id: string;
  source: string;
  target: string;
}

interface CameraMotion {
  startMs: number;
  endMs: number;
  source: Point;
  target: Point;
  direction: unknown;
}

const MIN_PRESENTATION_ZOOM = 0.85;
const CAMERA_FOCUS_X_PERCENT = 55;
const CAMERA_FOCUS_Y_PERCENT = 44;
const CONCURRENT_CAMERA_SAMPLE_MS = 1_200;
const CAMERA_AXIS_FOLLOW_THRESHOLD_PX = 48;

const average = (points: readonly Point[]): Point => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

const samePoint = (left: Point, right: Point) =>
  Math.abs(left.x - right.x) < 0.01 && Math.abs(left.y - right.y) < 0.01;

const hasOverlappingMotion = (motions: readonly CameraMotion[]) => {
  const windows = [...motions].sort(
    (left, right) => left.startMs - right.startMs
  );
  let latestEndMs = Number.NEGATIVE_INFINITY;
  for (const window of windows) {
    if (window.startMs < latestEndMs) return true;
    latestEndMs = Math.max(latestEndMs, window.endMs);
  }
  return false;
};

const pointOnMotion = (motion: CameraMotion, timeMs: number): Point => {
  if (motion.direction === "bidirectional") {
    return average([motion.source, motion.target]);
  }
  let progress = Math.min(
    1,
    Math.max(0, (timeMs - motion.startMs) / (motion.endMs - motion.startMs))
  );
  if (motion.direction === "ping-pong") {
    progress = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
  }
  const from = motion.direction === "reverse" ? motion.target : motion.source;
  const to = motion.direction === "reverse" ? motion.source : motion.target;
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
};

const concurrentFocuses = (motions: readonly CameraMotion[]) => {
  const firstMs = Math.min(...motions.map((motion) => motion.startMs));
  const lastMs = Math.max(...motions.map((motion) => motion.endMs));
  const times: number[] = [];
  for (
    let timeMs = firstMs;
    timeMs < lastMs;
    timeMs += CONCURRENT_CAMERA_SAMPLE_MS
  ) {
    times.push(timeMs);
  }
  times.push(lastMs);

  const raw = times.flatMap((atMs) => {
    const active = motions.filter(
      (motion) => motion.startMs <= atMs && motion.endMs >= atMs
    );
    return active.length > 0
      ? [
          {
            atMs,
            focus: average(
              active.map((motion) => pointOnMotion(motion, atMs))
            ),
          },
        ]
      : [];
  });

  return raw.map(({ atMs }, index) => {
    const weighted: Point[] = [];
    for (
      let nearbyIndex = Math.max(0, index - 2);
      nearbyIndex <= Math.min(raw.length - 1, index + 2);
      nearbyIndex += 1
    ) {
      const item = raw[nearbyIndex]!;
      const weight = 3 - Math.abs(nearbyIndex - index);
      for (let count = 0; count < weight; count += 1) {
        weighted.push(item.focus);
      }
    }
    return { atMs, focus: average(weighted) };
  });
};

export function preserveVideoPresentationViewport(
  viewport: Viewport,
  previousFrame: FrameOrigin,
  nextFrame: FrameOrigin
): Viewport {
  return {
    x: viewport.x + previousFrame.left - nextFrame.left,
    y: viewport.y + previousFrame.top - nextFrame.top,
    zoom: viewport.zoom,
  };
}

export function buildVideoCameraTrack({
  scenario,
  nodeCenters,
  edges,
  contentBounds,
  frame,
  initialViewport,
}: {
  scenario: ScenarioV1;
  nodeCenters: Readonly<Record<string, Point>>;
  edges: readonly CameraEdge[];
  contentBounds: { x: number; y: number; width: number; height: number };
  frame: { width: number; height: number };
  initialViewport: Viewport;
}): VideoCameraTrack {
  const presentationZoom = Math.max(
    initialViewport.zoom,
    MIN_PRESENTATION_ZOOM
  );
  const overflowX = contentBounds.width * presentationZoom > frame.width * 0.9;
  const overflowY = contentBounds.height * presentationZoom > frame.height * 0.9;
  if (!overflowX && !overflowY) {
    return { cues: [{ atMs: 0, viewport: initialViewport }] };
  }

  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const pointsByTime = new Map<number, Point[]>();
  const motions: CameraMotion[] = [];
  const addPoint = (atMs: number, point: Point) => {
    const safeTime = Math.max(0, Math.min(scenario.durationMs, atMs));
    const points = pointsByTime.get(safeTime) ?? [];
    points.push(point);
    pointsByTime.set(safeTime, points);
  };

  for (const track of scenario.tracks) {
    if (
      !track.enabled ||
      track.property !== "connection-effect" ||
      track.target.type !== "edge" ||
      !("id" in track.target)
    ) {
      continue;
    }
    const edge = edgesById.get(track.target.id);
    if (!edge) continue;
    const source = nodeCenters[edge.source];
    const target = nodeCenters[edge.target];
    if (!source || !target) continue;

    for (const clip of track.clips) {
      const direction = clip.effect.params.direction;
      const startMs = clip.startMs;
      const endMs = clip.startMs + clip.durationMs;
      motions.push({ startMs, endMs, source, target, direction });
      if (direction === "bidirectional") {
        const center = average([source, target]);
        addPoint(startMs, center);
        addPoint(endMs, center);
      } else if (direction === "ping-pong") {
        addPoint(startMs, source);
        addPoint(startMs + clip.durationMs / 2, target);
        addPoint(endMs, source);
      } else if (direction === "reverse") {
        addPoint(startMs, target);
        addPoint(endMs, source);
      } else {
        addPoint(startMs, source);
        addPoint(endMs, target);
      }
    }
  }

  const focuses = hasOverlappingMotion(motions)
    ? concurrentFocuses(motions)
    : [...pointsByTime.entries()]
        .sort(([left], [right]) => left - right)
        .map(([atMs, points]) => ({ atMs, focus: average(points) }));
  if (focuses.length === 0) {
    return { cues: [{ atMs: 0, viewport: initialViewport }] };
  }
  focuses[0] = { ...focuses[0]!, atMs: 0 };
  const xValues = focuses.map(({ focus }) => focus.x);
  const yValues = focuses.map(({ focus }) => focus.y);
  const followX =
    overflowX ||
    (Math.max(...xValues) - Math.min(...xValues)) * presentationZoom >
      CAMERA_AXIS_FOLLOW_THRESHOLD_PX;
  const followY =
    overflowY ||
    (Math.max(...yValues) - Math.min(...yValues)) * presentationZoom >
      CAMERA_AXIS_FOLLOW_THRESHOLD_PX;

  const cues: VideoCameraCue[] = [];
  for (const { atMs, focus } of focuses) {
    const viewport = {
      x: followX
        ? (frame.width * CAMERA_FOCUS_X_PERCENT) / 100 -
          focus.x * presentationZoom
        : initialViewport.x,
      y: followY
        ? (frame.height * CAMERA_FOCUS_Y_PERCENT) / 100 -
          focus.y * presentationZoom
        : initialViewport.y,
      zoom: presentationZoom,
    };
    const previous = cues[cues.length - 1];
    if (previous && samePoint(previous.viewport, viewport)) continue;
    cues.push({ atMs, viewport });
  }

  return { cues };
}

const tangent = (
  cues: readonly VideoCameraCue[],
  index: number,
  axis: "x" | "y" | "zoom"
) => {
  if (index === 0 || index === cues.length - 1) return 0;
  const previous = cues[index - 1]!;
  const next = cues[index + 1]!;
  return (
    (next.viewport[axis] - previous.viewport[axis]) /
    (next.atMs - previous.atMs)
  );
};

const interpolateAxis = (
  cues: readonly VideoCameraCue[],
  index: number,
  timeMs: number,
  axis: "x" | "y" | "zoom"
) => {
  const from = cues[index]!;
  const to = cues[index + 1]!;
  const duration = to.atMs - from.atMs;
  if (duration <= 0) return to.viewport[axis];
  const progress = Math.min(1, Math.max(0, (timeMs - from.atMs) / duration));
  const progress2 = progress * progress;
  const progress3 = progress2 * progress;
  const fromTangent = tangent(cues, index, axis) * duration;
  const toTangent = tangent(cues, index + 1, axis) * duration;
  return (
    (2 * progress3 - 3 * progress2 + 1) * from.viewport[axis] +
    (progress3 - 2 * progress2 + progress) * fromTangent +
    (-2 * progress3 + 3 * progress2) * to.viewport[axis] +
    (progress3 - progress2) * toTangent
  );
};

export function sampleVideoCameraTrack(
  track: VideoCameraTrack,
  timeMs: number
): Viewport {
  const first = track.cues[0];
  if (!first) return { x: 0, y: 0, zoom: 1 };
  if (timeMs <= first.atMs || track.cues.length === 1) return first.viewport;
  const last = track.cues[track.cues.length - 1]!;
  if (timeMs >= last.atMs) return last.viewport;

  const index = track.cues.findIndex((cue) => cue.atMs > timeMs) - 1;
  return {
    x: interpolateAxis(track.cues, index, timeMs, "x"),
    y: interpolateAxis(track.cues, index, timeMs, "y"),
    zoom: interpolateAxis(track.cues, index, timeMs, "zoom"),
  };
}

export function videoViewportTransform(
  viewport: Viewport,
  devicePixelRatio = 1
) {
  const ratio = Math.max(1, devicePixelRatio || 1);
  const snap = (value: number) => {
    const snapped = Math.round(value * ratio) / ratio;
    return Object.is(snapped, -0) ? 0 : snapped;
  };
  return `translate3d(${snap(viewport.x)}px, ${snap(viewport.y)}px, 0) scale(${viewport.zoom})`;
}
