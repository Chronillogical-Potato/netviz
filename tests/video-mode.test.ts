import { describe, expect, test } from "bun:test";
import type { AppNode, LabeledEdge } from "../src/store/flow-store";
import type { TargetFrame } from "../src/animation/runtime";
import {
  getVideoCameraViewport,
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
  test("uses the destination block as a stable cinematic focus", () => {
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

    expect(resolveVideoFollowPoint([activeFrame("edge-a", 0.2)], nodes, edges))
      .toEqual({ x: 450, y: 50 });
    expect(resolveVideoFollowPoint([activeFrame("edge-a", 0.8)], nodes, edges))
      .toEqual({ x: 450, y: 50 });
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

  test("creates a camera target for every block on an overflowing canvas", () => {
    expect(
      getVideoCameraViewport({
        contentBounds: { x: 0, y: 0, width: 2_000, height: 300 },
        viewport: { x: 0, y: 0, zoom: 1 },
        frame: { width: 1_000, height: 700 },
        focus: { x: 600, y: 150 },
      })
    ).toEqual({ x: -150, y: 0, zoom: 1 });
  });

  test("renders the active animation name and delegates camera motion", async () => {
    const source = await Bun.file(
      new URL("../src/components/canvas.tsx", import.meta.url)
    ).text();
    const packageJson = await Bun.file(
      new URL("../package.json", import.meta.url)
    ).json();

    expect(source).toContain("data-video-animation-name");
    expect(source).toContain("getActiveAnimationName");
    expect(source).toContain("videoTitle.trim()");
    expect(source).toContain("getActiveTargetFrames");
    expect(source).not.toContain("Now playing");
    expect(packageJson.dependencies.motion).toBeString();
    expect(source).toContain('from "motion"');
    expect(source).not.toContain("requestAnimationFrame");
    expect(source).not.toContain("advanceVideoCameraMotion");
    expect(source).toContain("setViewport");
    expect(source).not.toContain("smoothVideoFocusPoint");
    expect(source).not.toContain("cameraMoveDurationMs");
    expect(source).not.toContain("setCenter");
    expect(source).not.toContain("duration: 500");
  });
});
