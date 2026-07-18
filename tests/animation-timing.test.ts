import { describe, expect, test } from "bun:test";
import type { ScenarioClipV1 } from "../src/animation/model";
import { evaluateClipTiming } from "../src/animation/timing";

const clip = (
  direction: "forward" | "reverse" | "bidirectional" | "ping-pong" = "forward",
  overrides: Partial<ScenarioClipV1> = {}
): ScenarioClipV1 => ({
  id: "clip-1",
  startMs: 100,
  durationMs: 200,
  easing: "linear",
  repeatCount: 1,
  repeatDelayMs: 50,
  effect: { type: "edge.moving-dash", params: { direction } },
  ...overrides,
});

describe("clip timing", () => {
  test("distinguishes exact start, repeat-delay, next-cycle, and final boundaries", () => {
    expect(evaluateClipTiming(clip(), 99)).toMatchObject({
      phase: "before",
      active: false,
      iteration: 0,
      progress: 0,
    });
    expect(evaluateClipTiming(clip(), 100)).toMatchObject({
      phase: "active",
      active: true,
      iteration: 0,
      progress: 0,
    });
    expect(evaluateClipTiming(clip(), 299)).toMatchObject({
      phase: "active",
      active: true,
      iteration: 0,
      progress: 0.995,
    });
    expect(evaluateClipTiming(clip(), 300)).toMatchObject({
      phase: "repeat-delay",
      active: false,
      iteration: 0,
      progress: 1,
    });
    expect(evaluateClipTiming(clip(), 350)).toMatchObject({
      phase: "active",
      active: true,
      iteration: 1,
      progress: 0,
    });
    expect(evaluateClipTiming(clip(), 550)).toMatchObject({
      phase: "after",
      active: false,
      iteration: 1,
      progress: 1,
    });
  });

  test("starts a contiguous repeat at zero on the exact cycle boundary", () => {
    const timing = evaluateClipTiming(
      clip("forward", { repeatDelayMs: 0 }),
      300
    );

    expect(timing).toMatchObject({
      phase: "active",
      active: true,
      iteration: 1,
      progress: 0,
    });
  });

  test("supports an infinite repeat after arbitrarily large elapsed time", () => {
    const timing = evaluateClipTiming(
      clip("forward", {
        startMs: 0,
        durationMs: 100,
        repeatCount: "infinite",
        repeatDelayMs: 20,
      }),
      12_050
    );

    expect(timing).toMatchObject({
      phase: "active",
      active: true,
      iteration: 100,
      progress: 0.5,
    });
  });

  test("projects forward, reverse, bidirectional, and ping-pong motion", () => {
    expect(evaluateClipTiming(clip("forward"), 150)).toMatchObject({
      progress: 0.25,
      progresses: [0.25],
      travelDirection: "forward",
    });
    expect(evaluateClipTiming(clip("reverse"), 150)).toMatchObject({
      progress: 0.75,
      progresses: [0.75],
      travelDirection: "reverse",
    });
    expect(evaluateClipTiming(clip("bidirectional"), 150)).toMatchObject({
      progress: 0.25,
      progresses: [0.25, 0.75],
      travelDirection: "forward",
    });
    expect(evaluateClipTiming(clip("ping-pong"), 500)).toMatchObject({
      iteration: 1,
      progress: 0.5,
      progresses: [0.5],
      travelDirection: "reverse",
    });
  });

  test("returns a UI-created ping-pong clip without requiring repeats", () => {
    const authored = clip("ping-pong", {
      startMs: 0,
      durationMs: 1_200,
      repeatCount: 0,
      repeatDelayMs: 0,
    });

    expect(evaluateClipTiming(authored, 300)).toMatchObject({
      iteration: 0,
      progress: 0.5,
      travelDirection: "forward",
    });
    expect(evaluateClipTiming(authored, 900)).toMatchObject({
      iteration: 0,
      progress: 0.5,
      travelDirection: "reverse",
    });
  });

  test("treats a non-positive duration as an inert clip", () => {
    expect(
      evaluateClipTiming(clip("forward", { durationMs: 0 }), 100)
    ).toMatchObject({ phase: "after", active: false, progress: 1 });
  });
});
