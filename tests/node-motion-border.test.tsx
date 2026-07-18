import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScenarioClipV1 } from "../src/animation/model";
import type { TargetFrame } from "../src/animation/runtime";
import { evaluateClipTiming } from "../src/animation/timing";
import {
  NodeMotionBorder,
  applyNodeMotionTargetFrame,
} from "../src/components/nodes/node-motion-border";

const clip: ScenarioClipV1 = {
  id: "node-clip",
  startMs: 0,
  durationMs: 800,
  easing: "linear",
  repeatCount: 0,
  repeatDelayMs: 0,
  effect: {
    type: "node.border-beam",
    params: { colors: ["#ffaa40", "#9c40ff"] },
  },
};

class FakeStyle {
  values = new Map<string, string>();
  setProperty(name: string, value: string) {
    this.values.set(name, value);
  }
  removeProperty(name: string) {
    this.values.delete(name);
  }
}

class FakeElement {
  attributes = new Map<string, string>();
  style = new FakeStyle();
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

const frame = (timeMs: number, clear = false): TargetFrame => ({
  pageId: "page-1",
  scenarioId: "scenario-1",
  targetId: "node-a",
  timeMs,
  clear,
  clips: clear
    ? []
    : [
        {
          trackId: "node-track",
          clip,
          timing: evaluateClipTiming(clip, timeMs),
        },
      ],
});

describe("NodeMotionBorder", () => {
  test("renders an inert runtime border overlay", () => {
    expect(
      renderToStaticMarkup(<NodeMotionBorder nodeId="node-a" />)
    ).toContain("nv-node-motion-border");
  });

  test("projects the active border beam and clears it after the hop", () => {
    const element = new FakeElement();

    applyNodeMotionTargetFrame(element, frame(200));
    expect(element.attributes.get("data-motion-active")).toBe("true");
    expect(element.style.values.get("--node-flow-position")).toBe("85%");
    expect(element.style.values.has("--node-flow-angle")).toBe(false);
    expect(element.style.values.get("--node-flow-start")).toBe("#ffaa40");
    expect(element.style.values.get("--node-flow-end")).toBe("#9c40ff");

    applyNodeMotionTargetFrame(element, frame(800, true));
    expect(element.attributes.has("data-motion-active")).toBe(false);
    expect(element.style.values.get("--node-flow-opacity")).toBe("0");
  });
});
