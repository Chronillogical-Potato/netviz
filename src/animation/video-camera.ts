import type { ScenarioV1 } from "./model";

type Point = { x: number; y: number };
type Viewport = Point & { zoom: number };

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

const average = (points: readonly Point[]): Point => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

const samePoint = (left: Point, right: Point) =>
  Math.abs(left.x - right.x) < 0.01 && Math.abs(left.y - right.y) < 0.01;

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
  const overflowX =
    contentBounds.width * initialViewport.zoom > frame.width * 0.9;
  const overflowY =
    contentBounds.height * initialViewport.zoom > frame.height * 0.9;
  if (!overflowX && !overflowY) {
    return { cues: [{ atMs: 0, viewport: initialViewport }] };
  }

  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const pointsByTime = new Map<number, Point[]>();
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

  const focuses = [...pointsByTime.entries()]
    .sort(([left], [right]) => left - right)
    .map(([atMs, points]) => ({ atMs, focus: average(points) }));
  if (focuses.length === 0) {
    return { cues: [{ atMs: 0, viewport: initialViewport }] };
  }
  focuses[0] = { ...focuses[0]!, atMs: 0 };

  const cues: VideoCameraCue[] = [];
  for (const { atMs, focus } of focuses) {
    const viewport = {
      x: overflowX
        ? frame.width * 0.45 - focus.x * initialViewport.zoom
        : initialViewport.x,
      y: overflowY
        ? frame.height * 0.5 - focus.y * initialViewport.zoom
        : initialViewport.y,
      zoom: initialViewport.zoom,
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
