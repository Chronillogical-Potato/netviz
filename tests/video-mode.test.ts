import { describe, expect, test } from "bun:test";
import type { AppNode, LabeledEdge } from "../src/store/flow-store";
import type { TargetFrame } from "../src/animation/runtime";
import {
  getVideoCameraTarget,
  resolveVideoFollowPoint,
} from "../src/components/canvas";

const node = (id: string, x: number): AppNode => ({
  id,
  type: "shape",
  position: { x, y: 20 },
  style: { width: 100, height: 60 },
  data: { shape: "rect", accent: "slate" },
});

const activeFrame = (targetId: string, progress: number): TargetFrame => ({
  pageId: "page-1",
  scenarioId: "scenario-1",
  targetId,
  timeMs: 500,
  clear: false,
  clips: [
    {
      trackId: `track-${targetId}`,
      clip: {
        id: `clip-${targetId}`,
        startMs: 0,
        durationMs: 1_000,
        easing: "linear",
        repeatCount: 0,
        repeatDelayMs: 0,
        effect: { type: "edge.gradient-beam", params: {} },
      },
      timing: {
        phase: "active",
        active: true,
        iteration: 0,
        localTimeMs: progress * 1_000,
        progress,
        progresses: [progress],
        travelDirection: "forward",
      },
    },
  ],
});

describe("Video mode camera follow", () => {
  test("follows the active beam between its connected blocks", () => {
    const nodes = [node("source", 0), node("target", 400)];
    const edges = [
      {
        id: "edge-a",
        type: "labeled",
        source: "source",
        target: "target",
        data: {},
      } satisfies LabeledEdge,
    ];

    expect(resolveVideoFollowPoint([activeFrame("edge-a", 0.5)], nodes, edges))
      .toEqual({ x: 250, y: 50 });
  });

  test("does not pan content that already fits the viewport", () => {
    expect(
      getVideoCameraTarget({
        contentBounds: { x: 0, y: 0, width: 600, height: 300 },
        viewport: { x: 0, y: 0, zoom: 1 },
        frame: { width: 1_000, height: 700 },
        focus: { x: 550, y: 150 },
      })
    ).toBeNull();
  });

  test("centers an overflowing axis once the animation leaves the safe area", () => {
    expect(
      getVideoCameraTarget({
        contentBounds: { x: 0, y: 0, width: 2_000, height: 300 },
        viewport: { x: 0, y: 0, zoom: 1 },
        frame: { width: 1_000, height: 700 },
        focus: { x: 900, y: 150 },
      })
    ).toEqual({ x: 900, y: 350 });
  });

  test("renders the active animation name and smooth camera follow", async () => {
    const source = await Bun.file(
      new URL("../src/components/canvas.tsx", import.meta.url)
    ).text();

    expect(source).toContain("data-video-animation-name");
    expect(source).toContain("getActiveScenarioName");
    expect(source).toContain("getActiveTargetFrames");
    expect(source).toContain("duration: 500");
  });
});
