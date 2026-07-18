import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScenarioClipV1 } from "../src/animation/model";
import type { TargetFrame } from "../src/animation/runtime";
import { evaluateClipTiming } from "../src/animation/timing";
import { projectEdgeEffect } from "../src/animation/edge-effects";
import {
  EdgeMotionLayer,
  MAX_EDGE_EFFECT_SLOTS,
  subscribeEdgeMotionTarget,
  type EdgeMotionSlotElements,
} from "../src/components/edges/edge-motion-layer";

const clip = (
  effectType: string,
  params: ScenarioClipV1["effect"]["params"] = {}
): ScenarioClipV1 => ({
  id: "clip-1",
  startMs: 0,
  durationMs: 1_000,
  easing: "linear",
  repeatCount: 0,
  repeatDelayMs: 0,
  effect: { type: effectType, params },
});

const renderEffect = (
  authored: ScenarioClipV1,
  timeMs = 250,
  edgeId = "edge:/one"
) =>
  renderToStaticMarkup(
    <svg>
      <EdgeMotionLayer
        edgeId={edgeId}
        edgePath="M 0 0 C 10 5 20 10 30 0"
        gradientVector={{ x1: 0, y1: 0, x2: 30, y2: 10 }}
        projection={projectEdgeEffect(
          authored,
          evaluateClipTiming(authored, timeMs)
        )}
        motionState="playing"
      />
    </svg>
  );

class FakeSvgNode {
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
}

class FakeMeasuredPath extends FakeSvgNode {
  constructor(private readonly length = 100) {
    super();
  }

  getTotalLength() {
    return this.length;
  }

  getPointAtLength(length: number) {
    return { x: length, y: length * 2 };
  }
}

const fakeSlot = (): EdgeMotionSlotElements => ({
  group: new FakeSvgNode(),
  gradients: Array.from({ length: 4 }, () => new FakeSvgNode()),
  gradientStops: Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => new FakeSvgNode())
  ),
  paths: Array.from({ length: 4 }, () => new FakeSvgNode()),
});

class FakeTargetRuntime {
  targetId: string | null = null;
  listener: ((frame: TargetFrame) => void) | null = null;
  unsubscribed = false;

  subscribeTarget(targetId: string, listener: (frame: TargetFrame) => void) {
    this.targetId = targetId;
    this.listener = listener;
    return () => {
      this.unsubscribed = true;
    };
  }
}

class FakeTransportRuntime extends FakeTargetRuntime {
  isPlaying = true;

  getTransportSnapshot() {
    return { isPlaying: this.isPlaying };
  }
}

const targetFrame = (
  clips: ScenarioClipV1[],
  clear = false,
  timeMs = 250
): TargetFrame => ({
  pageId: "page-1",
  scenarioId: "scenario-1",
  targetId: "edge:/one",
  timeMs,
  clips: clips.map((authored, index) => ({
    trackId: `track-${index}`,
    clip: authored,
    timing: evaluateClipTiming(authored, timeMs),
  })),
  clear,
});

describe("EdgeMotionLayer", () => {
  test("derives live playing and paused state from the runtime frame channel", () => {
    const runtime = new FakeTransportRuntime();
    const slots = Array.from(
      { length: MAX_EDGE_EFFECT_SLOTS },
      fakeSlot
    );
    subscribeEdgeMotionTarget(runtime, "edge:/one", slots, () => ({
      motionState: "stopped",
      gradientVector: { x1: 0, y1: 0, x2: 1, y2: 0 },
    }));
    const authored = [{ ...clip("edge.pulse"), id: "clip-live-state" }];

    runtime.listener?.(targetFrame(authored));
    expect(slots[0].group?.getAttribute("data-motion-state")).toBe("playing");

    runtime.isPlaying = false;
    runtime.listener?.(targetFrame(authored));
    expect(slots[0].group?.getAttribute("data-motion-state")).toBe("paused");
  });

  test("imperatively projects overlapping runtime clips into a fixed slot pool", () => {
    const runtime = new FakeTargetRuntime();
    const slots = Array.from(
      { length: MAX_EDGE_EFFECT_SLOTS },
      fakeSlot
    );
    const unsubscribe = subscribeEdgeMotionTarget(
      runtime,
      "edge:/one",
      slots,
      () => ({
        motionState: "playing",
        gradientVector: { x1: 3, y1: 4, x2: 80, y2: 40 },
      })
    );
    const authored = [
      clip("edge.moving-dash"),
      clip("edge.gradient-beam"),
      clip("edge.packet"),
      clip("edge.pulse"),
      clip("edge.particle-stream"),
      clip("edge.moving-dash"),
    ].map((value, index) => ({ ...value, id: `clip-${index}` }));

    runtime.listener?.(targetFrame(authored));

    expect(runtime.targetId).toBe("edge:/one");
    expect(slots).toHaveLength(4);
    expect(
      slots.filter((slot) => slot.group?.getAttribute("display") !== "none")
    ).toHaveLength(4);
    expect(
      slots.map((slot) => slot.group?.getAttribute("data-effect-id"))
    ).toEqual(["clip-0", "clip-1", "clip-2", "clip-3"]);
    expect(slots[1].paths[0]?.getAttribute("data-motion-role")).toBe(
      "gradient-beam-base"
    );
    expect(slots[1].paths[1]?.getAttribute("data-motion-role")).toBe(
      "gradient-beam"
    );
    expect(slots[1].paths[2]?.getAttribute("display")).toBe("none");

    runtime.listener?.(targetFrame([], true));
    expect(
      slots.every((slot) => slot.group?.getAttribute("display") === "none")
    ).toBe(true);

    unsubscribe();
    expect(runtime.unsubscribed).toBe(true);
  });

  test("aligns the beam gradient to its exact curved path segment", () => {
    const runtime = new FakeTargetRuntime();
    const slot = fakeSlot();
    slot.paths[1] = new FakeMeasuredPath();
    subscribeEdgeMotionTarget(runtime, "edge:/one", [slot], () => ({
      motionState: "playing",
      gradientVector: { x1: 0, y1: 0, x2: 1_000, y2: 0 },
    }));

    runtime.listener?.(targetFrame([clip("edge.gradient-beam")]));

    expect(slot.gradients[1]?.getAttribute("x1")).toBe("37");
    expect(slot.gradients[1]?.getAttribute("y1")).toBe("74");
    expect(slot.gradients[1]?.getAttribute("x2")).toBe("0");
    expect(slot.gradients[1]?.getAttribute("y2")).toBe("0");
  });

  test("grows the beam out of the source block before detaching", () => {
    const runtime = new FakeTargetRuntime();
    const slot = fakeSlot();
    slot.paths[1] = new FakeMeasuredPath(100);
    subscribeEdgeMotionTarget(runtime, "edge:/one", [slot], () => ({
      motionState: "playing",
      gradientVector: { x1: 0, y1: 0, x2: 100, y2: 0 },
    }));
    const authored = clip("edge.gradient-beam", { beamLengthPx: 40 });

    runtime.listener?.(targetFrame([authored], false, 50));

    expect(slot.paths[1]?.getAttribute("stroke-dasharray")).toBe("0.07 0.93");
    expect(slot.paths[1]?.getAttribute("stroke-dashoffset")).toBe("1");
    expect(slot.gradientStops[1][3]?.getAttribute("stop-opacity")).toBeNull();

    runtime.listener?.(targetFrame([authored], false, 500));

    expect(slot.paths[1]?.getAttribute("stroke-dasharray")).toBe("0.4 0.6");
    expect(slot.paths[1]?.getAttribute("stroke-dashoffset")).toBe("0.7");
    expect(slot.gradientStops[1][3]?.getAttribute("stop-opacity")).toBe("0");
  });

  test("shrinks the beam into the target block before disappearing", () => {
    const runtime = new FakeTargetRuntime();
    const slot = fakeSlot();
    slot.paths[1] = new FakeMeasuredPath(100);
    subscribeEdgeMotionTarget(runtime, "edge:/one", [slot], () => ({
      motionState: "playing",
      gradientVector: { x1: 0, y1: 0, x2: 100, y2: 0 },
    }));
    const authored = clip("edge.gradient-beam", { beamLengthPx: 40 });

    runtime.listener?.(targetFrame([authored], false, 950));

    expect(slot.paths[1]?.getAttribute("stroke-dasharray")).toBe("0.07 0.93");
    expect(slot.paths[1]?.getAttribute("stroke-dashoffset")).toBe("0.07");
    expect(slot.gradientStops[1][0]?.getAttribute("stop-opacity")).toBeNull();
  });

  test("keeps an authored beam length consistent across different edge lengths", () => {
    const shortRuntime = new FakeTargetRuntime();
    const shortSlot = fakeSlot();
    shortSlot.paths[1] = new FakeMeasuredPath(100);
    subscribeEdgeMotionTarget(shortRuntime, "edge-short", [shortSlot], () => ({
      motionState: "playing",
      gradientVector: { x1: 0, y1: 0, x2: 100, y2: 0 },
    }));

    const longRuntime = new FakeTargetRuntime();
    const longSlot = fakeSlot();
    longSlot.paths[1] = new FakeMeasuredPath(200);
    subscribeEdgeMotionTarget(longRuntime, "edge-long", [longSlot], () => ({
      motionState: "playing",
      gradientVector: { x1: 0, y1: 0, x2: 200, y2: 0 },
    }));

    const authored = clip("edge.gradient-beam", { beamLengthPx: 40 });
    shortRuntime.listener?.(targetFrame([authored], false, 500));
    longRuntime.listener?.(targetFrame([authored], false, 500));

    expect(shortSlot.paths[1]?.getAttribute("stroke-dasharray")).toBe(
      "0.4 0.6"
    );
    expect(longSlot.paths[1]?.getAttribute("stroke-dasharray")).toBe(
      "0.2 0.8"
    );
  });

  test("reuses the exact base edge path for every motion primitive", () => {
    const edgePath = "M 3 7 C 19 41 83 -12 144 9";
    const authored = clip("edge.gradient-beam");
    const projection = projectEdgeEffect(
      authored,
      evaluateClipTiming(authored, 250)
    );
    const markup = renderToStaticMarkup(
      <svg>
        <path d={edgePath} data-edge-layer="base" />
        <EdgeMotionLayer
          edgeId="edge-shared-path"
          edgePath={edgePath}
          projection={projection}
          motionState="playing"
        />
      </svg>
    );
    const paths = [...markup.matchAll(/<path d="([^"]+)"[^>]*data-edge-layer="([^"]+)"/g)];
    const basePath = paths.find((match) => match[2] === "base")?.[1];
    const motionPaths = paths
      .filter((match) => match[2] === "motion")
      .map((match) => match[1]);
    const pooledPaths = [...markup.matchAll(/<path d="([^"]+)"/g)]
      .slice(1)
      .map((match) => match[1]);

    expect(basePath).toBe(edgePath);
    expect(motionPaths.length).toBeGreaterThan(0);
    expect(motionPaths.every((path) => path === basePath)).toBe(true);
    expect(pooledPaths.every((path) => path === basePath)).toBe(true);
    expect(markup.match(/pathLength="1"/g)).toHaveLength(pooledPaths.length);
  });

  test("renders a gradient beam on the exact normalized edge path with stable hooks", () => {
    const markup = renderEffect(clip("edge.gradient-beam"));

    expect(markup).toContain('class="nv-edge-motion"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('pointer-events="none"');
    expect(markup).toContain('data-edge-id="edge:/one"');
    expect(markup).toContain('data-effect-type="edge.gradient-beam"');
    expect(markup).toContain('data-motion-preset="gradient-beam"');
    expect(markup).toContain('data-motion-state="playing"');
    expect(markup).toContain('data-edge-layer="motion"');
    expect(markup).toContain('data-effect-id="clip-1"');
    expect(markup).toContain('d="M 0 0 C 10 5 20 10 30 0"');
    expect(markup).toContain('pathLength="1"');
    expect(markup.match(/data-edge-layer="motion"/g)).toHaveLength(2);
  });

  test("anchors the gradient beam to the source at its first frame", () => {
    const markup = renderEffect(clip("edge.gradient-beam"), 0);
    const beam = markup.match(
      /<path[^>]*data-motion-role="gradient-beam"[^>]*>/
    )?.[0];

    expect(beam).toContain('stroke-dasharray="0 1"');
    expect(beam).toContain('stroke-dashoffset="1"');
  });

  test("anchors a reversed gradient beam to the target at its first frame", () => {
    const markup = renderEffect(
      clip("edge.gradient-beam", { direction: "reverse" }),
      0
    );
    const beam = markup.match(
      /<path[^>]*data-motion-role="gradient-beam"[^>]*>/
    )?.[0];

    expect(beam).toContain('stroke-dasharray="0 1"');
    expect(beam).toContain('stroke-dashoffset="0"');
  });

  test("renders materially distinct bounded primitives for all five presets", () => {
    const dash = renderEffect(
      clip("edge.moving-dash", { dashLengthPx: 6, gapLengthPx: 11 })
    );
    expect(dash).toContain('data-motion-role="moving-dash"');
    expect(dash).toContain('stroke-dasharray="6px 11px"');

    const beam = renderEffect(clip("edge.gradient-beam"), 500);
    expect(beam).toContain('data-motion-role="gradient-beam-base"');
    expect(beam).toContain('stroke="gray"');
    expect(beam).toContain('stroke-width="2"');
    expect(beam).toContain('opacity="0.2"');
    expect(beam).toContain('data-motion-role="gradient-beam"');
    expect(beam).toContain('gradientUnits="userSpaceOnUse"');
    expect(beam).toContain('x1="16.5"');
    expect(beam).toContain('y1="5.5"');
    expect(beam).toContain('x2="13.5"');
    expect(beam).toContain('y2="4.5"');
    expect(beam).toContain(
      '<stop offset="0" stop-color="#ffaa40" stop-opacity="0"'
    );
    expect(beam).toContain('<stop offset="0" stop-color="#ffaa40"');
    expect(beam).toContain('<stop offset="0.325" stop-color="#9c40ff"');
    expect(beam).toContain(
      '<stop offset="1" stop-color="#9c40ff" stop-opacity="0"'
    );
    expect(beam).not.toContain("drop-shadow");

    const packet = renderEffect(clip("edge.packet", { sizePx: 7 }));
    expect(packet).toContain('data-motion-role="packet-tail"');
    expect(packet).toContain('data-motion-role="packet-core"');

    const pulse = renderEffect(clip("edge.pulse"));
    expect(pulse).toContain('data-motion-role="pulse"');
    expect(pulse).not.toContain("stroke-dasharray=");

    const particles = renderEffect(
      clip("edge.particle-stream", { count: 24, particleSizePx: 4 })
    );
    expect(particles).toContain('data-motion-role="particles"');
    expect(particles).toContain('data-particle-count="24"');
    expect(particles).toContain('stroke-linecap="round"');
    expect(particles.match(/data-motion-role="particles"/g)).toHaveLength(1);
  });

  test("derives gradient IDs that are stable and collision resistant", () => {
    const authored = clip("edge.gradient-beam");
    const first = renderEffect(authored, 250, "edge/a");
    const repeated = renderEffect(authored, 250, "edge/a");
    const similar = renderEffect(authored, 250, "edge a");
    const gradientId = (markup: string) =>
      markup.match(
        /data-motion-role="gradient-beam"[^>]*stroke="url\(#([^"]+)\)"/
      )?.[1];

    expect(gradientId(first)).toBeDefined();
    expect(gradientId(first)).toBe(gradientId(repeated));
    expect(gradientId(first)).not.toBe(gradientId(similar));
    expect(first).toContain(`stroke="url(#${gradientId(first)})"`);
  });
});
