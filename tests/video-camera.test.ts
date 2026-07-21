import { describe, expect, test } from "bun:test";
import type { ScenarioV1 } from "../src/animation/model";
import {
  buildVideoCameraTrack,
  sampleVideoCameraTrack,
  videoViewportTransform,
} from "../src/animation/video-camera";

const scenario: ScenarioV1 = {
  id: "request-flow",
  name: "Request flow",
  durationMs: 3_000,
  playback: {
    rate: 1,
    loop: { mode: "none", startMs: 0, endMs: 3_000 },
  },
  markers: [],
  triggers: [],
  tracks: [
    {
      id: "edge-a-track",
      target: { type: "edge", id: "edge-a" },
      property: "connection-effect",
      enabled: true,
      clips: [
        {
          id: "edge-a-clip",
          startMs: 400,
          durationMs: 600,
          easing: "linear",
          repeatCount: 0,
          repeatDelayMs: 0,
          effect: {
            type: "edge.gradient-beam",
            params: { direction: "forward" },
          },
        },
      ],
    },
    {
      id: "edge-b-track",
      target: { type: "edge", id: "edge-b" },
      property: "connection-effect",
      enabled: true,
      clips: [
        {
          id: "edge-b-clip",
          startMs: 1_800,
          durationMs: 600,
          easing: "linear",
          repeatCount: 0,
          repeatDelayMs: 0,
          effect: {
            type: "edge.gradient-beam",
            params: { direction: "forward" },
          },
        },
      ],
    },
  ],
};

const track = () =>
  buildVideoCameraTrack({
    scenario,
    nodeCenters: {
      client: { x: 100, y: 100 },
      firewall: { x: 600, y: 100 },
      server: { x: 1_100, y: 100 },
    },
    edges: [
      { id: "edge-a", source: "client", target: "firewall" },
      { id: "edge-b", source: "firewall", target: "server" },
    ],
    contentBounds: { x: 0, y: 0, width: 1_200, height: 800 },
    frame: { width: 800, height: 600 },
    initialViewport: { x: 0, y: 0, zoom: 1 },
  });

describe("video camera track", () => {
  test("preserves the exact zoom and screen position when editor chrome disappears", async () => {
    const cameraModule = (await import(
      "../src/animation/video-camera"
    )) as typeof import("../src/animation/video-camera") & {
      preserveVideoPresentationViewport?: (
        viewport: { x: number; y: number; zoom: number },
        previousFrame: { left: number; top: number },
        nextFrame: { left: number; top: number }
      ) => { x: number; y: number; zoom: number };
    };
    const preserveViewport =
      cameraModule.preserveVideoPresentationViewport;

    expect(typeof preserveViewport).toBe("function");
    if (!preserveViewport) return;

    const node = { x: 240, y: 180 };
    const viewport = { x: 120, y: 90, zoom: 0.85 };
    const editorFrame = { left: 251, top: 52 };
    const presentationFrame = { left: 0, top: 0 };
    const preserved = preserveViewport(
      viewport,
      editorFrame,
      presentationFrame
    );
    const before = {
      x: editorFrame.left + viewport.x + node.x * viewport.zoom,
      y: editorFrame.top + viewport.y + node.y * viewport.zoom,
    };
    const after = {
      x: presentationFrame.left + preserved.x + node.x * preserved.zoom,
      y: presentationFrame.top + preserved.y + node.y * preserved.zoom,
    };

    expect(preserved.zoom).toBe(viewport.zoom);
    expect(after).toEqual(before);
  });

  test("does not move an already visible diagram", () => {
    const camera = buildVideoCameraTrack({
      scenario,
      nodeCenters: {
        client: { x: 100, y: 100 },
        firewall: { x: 300, y: 100 },
        server: { x: 500, y: 100 },
      },
      edges: [
        { id: "edge-a", source: "client", target: "firewall" },
        { id: "edge-b", source: "firewall", target: "server" },
      ],
      contentBounds: { x: 0, y: 0, width: 600, height: 200 },
      frame: { width: 800, height: 600 },
      initialViewport: { x: 12, y: 24, zoom: 1 },
    });

    expect(camera.cues).toEqual([
      { atMs: 0, viewport: { x: 12, y: 24, zoom: 1 } },
    ]);
  });

  test("holds the composed view instead of chasing overlapping beams", () => {
    const concurrentScenario: ScenarioV1 = {
      ...scenario,
      tracks: [
        scenario.tracks[0]!,
        {
          ...scenario.tracks[1]!,
          clips: [
            {
              ...scenario.tracks[1]!.clips[0]!,
              startMs: 700,
            },
          ],
        },
      ],
    };
    const initialViewport = { x: 40, y: 80, zoom: 0.6 };
    const camera = buildVideoCameraTrack({
      scenario: concurrentScenario,
      nodeCenters: {
        client: { x: 100, y: 100 },
        firewall: { x: 600, y: 100 },
        server: { x: 1_100, y: 100 },
      },
      edges: [
        { id: "edge-a", source: "client", target: "firewall" },
        { id: "edge-b", source: "firewall", target: "server" },
      ],
      contentBounds: { x: 0, y: 0, width: 1_200, height: 800 },
      frame: { width: 800, height: 600 },
      initialViewport,
    });

    expect(camera.cues).toEqual([{ atMs: 0, viewport: initialViewport }]);
  });

  test("uses a readable presentation zoom instead of inheriting fit-view zoom", () => {
    const camera = buildVideoCameraTrack({
      scenario,
      nodeCenters: {
        client: { x: 100, y: 100 },
        firewall: { x: 600, y: 100 },
        server: { x: 1_100, y: 100 },
      },
      edges: [
        { id: "edge-a", source: "client", target: "firewall" },
        { id: "edge-b", source: "firewall", target: "server" },
      ],
      contentBounds: { x: 0, y: 0, width: 1_200, height: 200 },
      frame: { width: 800, height: 600 },
      initialViewport: { x: 40, y: 80, zoom: 0.5 },
    });

    expect(camera.cues.length).toBeGreaterThan(1);
    expect(camera.cues.every((cue) => cue.viewport.zoom === 0.85)).toBeTrue();
  });

  test("plans the full connected route before playback without a hold at a block", () => {
    expect(track().cues).toEqual([
      { atMs: 0, viewport: { x: 340, y: 164, zoom: 1 } },
      { atMs: 1_000, viewport: { x: -160, y: 164, zoom: 1 } },
      { atMs: 2_400, viewport: { x: -660, y: 164, zoom: 1 } },
    ]);
  });

  test("keeps moving through an internal cue instead of stopping and restarting", () => {
    const camera = track();
    const before = sampleVideoCameraTrack(camera, 999);
    const atCue = sampleVideoCameraTrack(camera, 1_000);
    const after = sampleVideoCameraTrack(camera, 1_001);

    expect(atCue.x - before.x).toBeLessThan(-0.1);
    expect(after.x - atCue.x).toBeLessThan(-0.1);
    expect(Math.abs((atCue.x - before.x) - (after.x - atCue.x))).toBeLessThan(
      0.01
    );
  });

  test("lands exactly and remains completely still after the final cue", () => {
    const camera = track();
    expect(sampleVideoCameraTrack(camera, 2_400)).toEqual({
      x: -660,
      y: 164,
      zoom: 1,
    });
    expect(sampleVideoCameraTrack(camera, 200_000)).toEqual({
      x: -660,
      y: 164,
      zoom: 1,
    });
  });

  test("quantizes the compositor transform to physical pixels", () => {
    expect(
      videoViewportTransform({ x: 10.24, y: -20.26, zoom: 1 }, 2)
    ).toBe("translate3d(10px, -20.5px, 0) scale(1)");
  });
});
