import { describe, expect, test } from "bun:test";
import type { AppNode, LabeledEdge } from "../src/store/flow-store";
import type { TargetFrame } from "../src/animation/runtime";
import {
  getVideoCameraViewport,
  resolveVideoFollowPoint,
  smoothVideoViewport,
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
      getVideoCameraViewport({
        contentBounds: { x: 0, y: 0, width: 600, height: 300 },
        viewport: { x: 0, y: 0, zoom: 1 },
        frame: { width: 1_000, height: 700 },
        focus: { x: 550, y: 150 },
      })
    ).toBeNull();
  });

  test("centers an overflowing axis once the animation leaves the safe area", () => {
    expect(
      getVideoCameraViewport({
        contentBounds: { x: 0, y: 0, width: 2_000, height: 300 },
        viewport: { x: 0, y: 0, zoom: 1 },
        frame: { width: 1_000, height: 700 },
        focus: { x: 900, y: 150 },
      })
    ).toEqual({ x: -450, y: 0, zoom: 1 });
  });

  test("smooths camera frames without overshoot or frame-rate dependence", () => {
    const current = { x: 0, y: 0, zoom: 1 };
    const target = { x: -600, y: -200, zoom: 1 };
    const first = smoothVideoViewport(current, target, 16);

    expect(first.x).toBeLessThan(0);
    expect(first.x).toBeGreaterThan(-600);
    expect(first.y).toBeLessThan(0);
    expect(first.y).toBeGreaterThan(-200);

    let dense = current;
    for (let frame = 0; frame < 10; frame += 1) {
      dense = smoothVideoViewport(dense, target, 16);
    }
    const sparse = smoothVideoViewport(current, target, 160);
    expect(dense.x).toBeCloseTo(sparse.x, 6);
    expect(dense.y).toBeCloseTo(sparse.y, 6);
  });

  test("smooths the moving focus before moving the camera", async () => {
    const canvas = (await import("../src/components/canvas")) as unknown as {
      smoothVideoFocusPoint?: (
        current: { x: number; y: number },
        target: { x: number; y: number },
        elapsedMs: number
      ) => { x: number; y: number };
    };

    expect(typeof canvas.smoothVideoFocusPoint).toBe("function");
    if (!canvas.smoothVideoFocusPoint) return;

    const current = { x: 0, y: 0 };
    const target = { x: 800, y: 300 };
    const first = canvas.smoothVideoFocusPoint(current, target, 16);
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(800);
    expect(first.y).toBeGreaterThan(0);
    expect(first.y).toBeLessThan(300);

    let dense = current;
    for (let frame = 0; frame < 10; frame += 1) {
      dense = canvas.smoothVideoFocusPoint(dense, target, 16);
    }
    const sparse = canvas.smoothVideoFocusPoint(current, target, 160);
    expect(dense.x).toBeCloseTo(sparse.x, 6);
    expect(dense.y).toBeCloseTo(sparse.y, 6);
  });

  test("renders the active animation name and smooth camera follow", async () => {
    const source = await Bun.file(
      new URL("../src/components/canvas.tsx", import.meta.url)
    ).text();

    expect(source).toContain("data-video-animation-name");
    expect(source).toContain("getActiveAnimationName");
    expect(source).toContain("videoTitle.trim()");
    expect(source).toContain("getActiveTargetFrames");
    expect(source).not.toContain("Now playing");
    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain("setViewport");
    expect(source).not.toContain("setCenter");
    expect(source).not.toContain("duration: 500");
  });
});
