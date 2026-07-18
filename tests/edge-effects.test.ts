import { describe, expect, test } from "bun:test";
import type { ScenarioClipV1 } from "../src/animation/model";
import { evaluateClipTiming } from "../src/animation/timing";
import { projectEdgeEffect } from "../src/animation/edge-effects";

const clip = (
  effectType = "edge.moving-dash",
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

describe("edge effect projection", () => {
  test("consumes unit-explicit migrated moving-dash parameters without fallback", () => {
    const authored = clip("edge.moving-dash", {
      dashLengthPx: 6,
      gapLengthPx: 11,
      glowColor: "#f97316",
      glowBlurPx: 9,
      colors: ["#22d3ee", "#6366f1"],
    });
    const projection = projectEdgeEffect(
      authored,
      evaluateClipTiming(authored, 250)
    );

    if (!projection.supported) throw new Error("Expected a supported effect");
    expect(projection).toMatchObject({
      colors: ["#22d3ee", "#6366f1"],
      glowColor: "#f97316",
      glowBlurPx: 9,
      dashLengthPx: 6,
      gapLengthPx: 11,
    });
  });

  test("projects moving-dash defaults from evaluated clip timing", () => {
    const authored = clip();
    const projection = projectEdgeEffect(
      authored,
      evaluateClipTiming(authored, 250)
    );

    if (!projection.supported) throw new Error("Expected a supported effect");
    expect(projection).toMatchObject({
      effectId: "clip-1",
      effectType: "edge.moving-dash",
      preset: "moving-dash",
      active: true,
      timingPhase: "active",
      direction: "forward",
      phases: [0.25],
      startOffset: 0,
      endOffset: 0,
      widthPx: 2,
      opacity: 1,
      colors: ["#38bdf8", "#818cf8"],
      glowColor: "#38bdf8",
      glowBlurPx: 0,
      dashLengthPx: 8,
      gapLengthPx: 6,
    });
  });

  test("clamps common parameters and maps bidirectional phases between path offsets", () => {
    const authored = clip("edge.moving-dash", {
      direction: "bidirectional",
      startOffset: 0.2,
      endOffset: 0.3,
      widthPx: 99,
      opacity: -4,
      glow: 99,
      color: "",
      dashLength: -1,
      gapLength: 99,
    });
    const projection = projectEdgeEffect(
      authored,
      evaluateClipTiming(authored, 250)
    );

    if (!projection.supported) throw new Error("Expected a supported effect");
    expect(projection).toMatchObject({
      direction: "bidirectional",
      phases: [0.325, 0.575],
      startOffset: 0.2,
      endOffset: 0.3,
      widthPx: 24,
      opacity: 0,
      colors: ["#38bdf8", "#818cf8"],
      glowColor: "#38bdf8",
      glowBlurPx: 32,
      dashLengthPx: 0.5,
      gapLengthPx: 99,
    });
  });

  test("projects gradient-beam defaults", () => {
    const authored = clip("edge.gradient-beam");
    const projection = projectEdgeEffect(
      authored,
      evaluateClipTiming(authored, 500)
    );

    if (!projection.supported) throw new Error("Expected a supported effect");
    expect(projection).toMatchObject({
      preset: "gradient-beam",
      phases: [0.5],
      colors: ["#38bdf8", "#818cf8"],
      trailLengthRatio: 0.24,
    });
  });

  test("projects packet defaults", () => {
    const authored = clip("edge.packet");
    const projection = projectEdgeEffect(
      authored,
      evaluateClipTiming(authored, 750)
    );

    if (!projection.supported) throw new Error("Expected a supported effect");
    expect(projection).toMatchObject({
      preset: "packet",
      phases: [0.75],
      packetLengthRatio: 0.025,
      sizePx: 6,
    });
  });

  test("preserves the packet sizePx parameter", () => {
    const authored = clip("edge.packet", { sizePx: 13 });
    const projection = projectEdgeEffect(
      authored,
      evaluateClipTiming(authored, 750)
    );

    if (!projection.supported) throw new Error("Expected a supported effect");
    expect(projection).toMatchObject({
      preset: "packet",
      sizePx: 13,
    });
  });

  test("projects pulse defaults", () => {
    const authored = clip("edge.pulse");
    const projection = projectEdgeEffect(
      authored,
      evaluateClipTiming(authored, 100)
    );

    if (!projection.supported) throw new Error("Expected a supported effect");
    expect(projection).toMatchObject({
      preset: "pulse",
      phases: [0.1],
    });
  });

  test("caps particle-stream geometry parameters", () => {
    const authored = clip("edge.particle-stream", {
      particleCount: 1_000,
      particleSize: -10,
    });
    const projection = projectEdgeEffect(
      authored,
      evaluateClipTiming(authored, 400)
    );

    if (!projection.supported) throw new Error("Expected a supported effect");
    expect(projection).toMatchObject({
      preset: "particle-stream",
      count: 24,
      particleSizePx: 0.5,
      spacingPx: 12,
      distribution: "count",
    });
  });

  test("projects pixel-explicit particle parameters and caps count", () => {
    const authored = clip("edge.particle-stream", {
      particleSizePx: 5,
      count: 1_000,
      spacingPx: 18,
    });
    const projection = projectEdgeEffect(
      authored,
      evaluateClipTiming(authored, 400)
    );

    if (!projection.supported) throw new Error("Expected a supported effect");
    expect(projection).toMatchObject({
      preset: "particle-stream",
      particleSizePx: 5,
      count: 24,
      spacingPx: 18,
      distribution: "count",
    });
  });

  test("marks unknown effects unsupported with no motion projection", () => {
    const authored = clip("edge.future-ribbon", { vendor: "kept" });

    expect(
      projectEdgeEffect(authored, evaluateClipTiming(authored, 200))
    ).toEqual({
      supported: false,
      effectId: "clip-1",
      effectType: "edge.future-ribbon",
      preset: null,
      active: false,
      phases: [],
      reason: "unsupported-effect",
    });
  });
});
