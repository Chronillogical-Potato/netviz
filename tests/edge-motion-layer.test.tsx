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

const fakeSlot = (): EdgeMotionSlotElements => ({
  group: new FakeSvgNode(),
  gradient: new FakeSvgNode(),
  gradientStops: [new FakeSvgNode(), new FakeSvgNode(), new FakeSvgNode()],
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
  clear = false
): TargetFrame => ({
  pageId: "page-1",
  scenarioId: "scenario-1",
  targetId: "edge:/one",
  timeMs: 250,
  clips: clips.map((authored, index) => ({
    trackId: `track-${index}`,
    clip: authored,
    timing: evaluateClipTiming(authored, 250),
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
      "beam-trail"
    );
    expect(slots[1].paths[1]?.getAttribute("data-motion-role")).toBe(
      "beam-core"
    );

    runtime.listener?.(targetFrame([], true));
    expect(
      slots.every((slot) => slot.group?.getAttribute("display") === "none")
    ).toBe(true);

    unsubscribe();
    expect(runtime.unsubscribed).toBe(true);
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

  test("renders materially distinct bounded primitives for all five presets", () => {
    const dash = renderEffect(
      clip("edge.moving-dash", { dashLengthPx: 6, gapLengthPx: 11 })
    );
    expect(dash).toContain('data-motion-role="moving-dash"');
    expect(dash).toContain('stroke-dasharray="6px 11px"');

    const beam = renderEffect(clip("edge.gradient-beam"));
    expect(beam).toContain('data-motion-role="beam-trail"');
    expect(beam).toContain('data-motion-role="beam-core"');
    expect(beam).toContain('gradientUnits="userSpaceOnUse"');
    expect(beam).toContain('x1="0"');
    expect(beam).toContain('y1="0"');
    expect(beam).toContain('x2="30"');
    expect(beam).toContain('y2="10"');

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
      markup.match(/<linearGradient id="([^"]+)"/)?.[1];

    expect(gradientId(first)).toBeDefined();
    expect(gradientId(first)).toBe(gradientId(repeated));
    expect(gradientId(first)).not.toBe(gradientId(similar));
    expect(first).toContain(`stroke="url(#${gradientId(first)})"`);
  });
});
