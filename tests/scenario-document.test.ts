import { describe, expect, test } from "bun:test";
import {
  EDGE_EFFECT_PRESETS,
  type PageScenarioDocumentV1,
  type ScenarioV1,
} from "../src/animation/model";
import {
  applyEdgeEffect,
  cloneScenarioTargets,
  createDefaultScenarioDocument,
  createEmptyScenarioDocument,
  createScenario,
  patchEdgeEffects,
  pruneScenarioTargets,
  removeEdgeEffects,
  summarizeEdgeEffectField,
  summarizeField,
} from "../src/animation/scenario-document";

function ids(...values: string[]) {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (value === undefined) throw new Error("Test ID factory exhausted");
    return value;
  };
}

function scenarioDocument(scenario: ScenarioV1): PageScenarioDocumentV1 {
  return {
    schemaVersion: 1,
    scenarios: [scenario],
    defaultScenarioId: scenario.id,
  };
}

describe("scenario document factories", () => {
  test("creates independent empty page documents", () => {
    const first = createEmptyScenarioDocument();
    const second = createEmptyScenarioDocument();

    expect(first).toEqual({
      schemaVersion: 1,
      scenarios: [],
      defaultScenarioId: null,
    });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.scenarios).not.toBe(first.scenarios);
  });

  test("creates a deterministic default scenario without sharing track arrays", () => {
    const first = createDefaultScenarioDocument({
      idFactory: ids("scenario-a"),
    });
    const second = createDefaultScenarioDocument({
      idFactory: ids("scenario-b"),
    });

    expect(first).toEqual({
      schemaVersion: 1,
      scenarios: [
        {
          id: "scenario-a",
          name: "Default scenario",
          durationMs: 4_000,
          playback: {
            rate: 1,
            loop: { mode: "repeat", startMs: 0, endMs: 4_000 },
          },
          tracks: [],
          markers: [],
          triggers: [],
        },
      ],
      defaultScenarioId: "scenario-a",
    });
    expect(second.scenarios[0]?.tracks).not.toBe(first.scenarios[0]?.tracks);
  });

  test("declares the five Stage 1 edge presets", () => {
    expect(EDGE_EFFECT_PRESETS).toEqual([
      "edge.moving-dash",
      "edge.gradient-beam",
      "edge.packet",
      "edge.pulse",
      "edge.particle-stream",
    ]);
  });
});

describe("scenario document edits", () => {
  test("applies an edge effect by creating the default scenario and fresh targets", () => {
    const original = createEmptyScenarioDocument();
    const updated = applyEdgeEffect(original, {
      edgeIds: ["edge-a", "edge-b", "edge-a"],
      effect: {
        type: "edge.gradient-beam",
        params: {
          colors: ["#38bdf8", "#818cf8"],
          opacity: 0.8,
          direction: "reverse",
        },
      },
      clip: { durationMs: 1_800 },
      idFactory: ids(
        "scenario-1",
        "track-a",
        "clip-a",
        "track-b",
        "clip-b"
      ),
    });

    expect(original).toEqual(createEmptyScenarioDocument());
    expect(updated.defaultScenarioId).toBe("scenario-1");
    expect(updated.scenarios[0]?.durationMs).toBe(1_800);
    expect(updated.scenarios[0]?.playback.loop.endMs).toBe(1_800);
    expect(updated.scenarios[0]?.tracks).toEqual([
      {
        id: "track-a",
        target: { type: "edge", id: "edge-a" },
        property: "connection-effect",
        enabled: true,
        clips: [
          {
            id: "clip-a",
            startMs: 0,
            durationMs: 1_800,
            easing: "linear",
            repeatCount: 0,
            repeatDelayMs: 0,
            effect: {
              type: "edge.gradient-beam",
              params: {
                colors: ["#38bdf8", "#818cf8"],
                opacity: 0.8,
                direction: "reverse",
              },
            },
          },
        ],
      },
      {
        id: "track-b",
        target: { type: "edge", id: "edge-b" },
        property: "connection-effect",
        enabled: true,
        clips: [
          expect.objectContaining({
            id: "clip-b",
            effect: expect.objectContaining({ type: "edge.gradient-beam" }),
          }),
        ],
      },
    ]);
  });

  test("preserves unknown effects and parameters while patching existing clips only", () => {
    const original = applyEdgeEffect(createEmptyScenarioDocument(), {
      edgeIds: ["edge-a"],
      effect: {
        type: "future-ripple-v4",
        params: {
          vendor: { mode: "aurora", samples: [1, 2, 3] },
          strength: 0.75,
        },
      },
      idFactory: ids("scenario-1", "track-a", "clip-a"),
    });

    const updated = patchEdgeEffects(original, {
      edgeIds: ["edge-a", "edge-without-a-clip"],
      patch: {
        durationMs: 900,
        effect: { params: { strength: 0.5 } },
      },
    });

    expect(original.scenarios[0]?.tracks[0]?.clips[0]).toEqual(
      expect.objectContaining({ durationMs: 1_200 })
    );
    expect(updated.scenarios[0]?.tracks).toHaveLength(1);
    expect(updated.scenarios[0]?.tracks[0]?.clips[0]).toEqual(
      expect.objectContaining({
        durationMs: 900,
        effect: {
          type: "future-ripple-v4",
          params: {
            vendor: { mode: "aurora", samples: [1, 2, 3] },
            strength: 0.5,
          },
        },
      })
    );
    expect(updated.scenarios[0]?.durationMs).toBe(900);
    expect(updated.scenarios[0]?.playback.loop.endMs).toBe(900);
  });

  test("returns the original document when a timing patch has no existing clip", () => {
    const original = createEmptyScenarioDocument();

    expect(
      patchEdgeEffects(original, {
        edgeIds: ["edge-a"],
        patch: { startMs: 250 },
      })
    ).toBe(original);
  });

  test("does not create a scenario for blank edge IDs", () => {
    const original = createEmptyScenarioDocument();
    expect(
      applyEdgeEffect(original, {
        edgeIds: ["", "   "],
        effect: { type: "edge.packet", params: {} },
      })
    ).toBe(original);
  });

  test("deep-merges nested parameters without deleting unknown siblings", () => {
    const original = applyEdgeEffect(createEmptyScenarioDocument(), {
      edgeIds: ["edge-a"],
      effect: {
        type: "edge.gradient-beam",
        params: {
          appearance: {
            color: "#38bdf8",
            futureGlowModel: { kind: "vendor", strength: 0.7 },
          },
        },
      },
      idFactory: ids("scenario-1", "track-a", "clip-a"),
    });
    const updated = patchEdgeEffects(original, {
      edgeIds: ["edge-a"],
      patch: {
        effect: { params: { appearance: { color: "#f8fafc" } } },
      },
    });

    expect(
      updated.scenarios[0].tracks[0].clips[0].effect.params.appearance
    ).toEqual({
      color: "#f8fafc",
      futureGlowModel: { kind: "vendor", strength: 0.7 },
    });
  });

  test("removes only the selected edge effect tracks", () => {
    const scenario = createScenario({ id: "scenario-1" });
    const withEffects = applyEdgeEffect(scenarioDocument(scenario), {
      edgeIds: ["edge-a", "edge-b"],
      effect: { type: "edge.packet", params: { direction: "forward" } },
      idFactory: ids("track-a", "clip-a", "track-b", "clip-b"),
    });

    const updated = removeEdgeEffects(withEffects, { edgeIds: ["edge-a"] });

    expect(
      updated.scenarios[0]?.tracks.map((track) => track.target)
    ).toEqual([{ type: "edge", id: "edge-b" }]);
    expect(withEffects.scenarios[0]?.tracks).toHaveLength(2);
  });
});

describe("scenario target lifecycle", () => {
  test("clones remapped targets with fresh track and clip IDs", () => {
    const original = applyEdgeEffect(createEmptyScenarioDocument(), {
      edgeIds: ["edge-a"],
      effect: {
        type: "future-preset",
        params: { nested: { values: ["kept"] } },
      },
      idFactory: ids("scenario-1", "track-a", "clip-a"),
    });

    const updated = cloneScenarioTargets(
      original,
      [
        {
          source: { type: "edge", id: "edge-a" },
          target: { type: "edge", id: "edge-copy" },
        },
      ],
      ids("track-copy", "clip-copy")
    );
    const originalTrack = updated.scenarios[0]?.tracks[0];
    const copiedTrack = updated.scenarios[0]?.tracks[1];

    expect(copiedTrack).toEqual({
      ...originalTrack,
      id: "track-copy",
      target: { type: "edge", id: "edge-copy" },
      clips: [
        {
          ...originalTrack?.clips[0],
          id: "clip-copy",
        },
      ],
    });
    expect(copiedTrack?.clips[0]?.effect.params).not.toBe(
      originalTrack?.clips[0]?.effect.params
    );
    expect(original.scenarios[0]?.tracks).toHaveLength(1);
  });

  test("prunes matching target types and IDs from every scenario", () => {
    const first = applyEdgeEffect(createEmptyScenarioDocument(), {
      edgeIds: ["shared-id", "edge-b"],
      effect: { type: "edge.pulse", params: { direction: "forward" } },
      idFactory: ids(
        "scenario-1",
        "track-a",
        "clip-a",
        "track-b",
        "clip-b"
      ),
    });
    const withNodeTrack: PageScenarioDocumentV1 = {
      ...first,
      scenarios: [
        {
          ...first.scenarios[0]!,
          tracks: [
            ...first.scenarios[0]!.tracks,
            {
              id: "node-track",
              target: { type: "node", id: "shared-id" },
              property: "appearance",
              enabled: true,
              clips: [],
            },
          ],
        },
      ],
    };

    const updated = pruneScenarioTargets(withNodeTrack, [
      { type: "edge", id: "shared-id" },
    ]);

    expect(
      updated.scenarios[0]?.tracks.map((track) => [
        track.target.type,
        track.target.id,
      ])
    ).toEqual([
      ["edge", "edge-b"],
      ["node", "shared-id"],
    ]);
  });
});

describe("mixed field summaries", () => {
  test("distinguishes none, uniform, and mixed values without guessing", () => {
    expect(summarizeField<number>([])).toEqual({ status: "none" });
    expect(summarizeField([undefined, undefined])).toEqual({ status: "none" });
    expect(summarizeField([1_200, 1_200])).toEqual({
      status: "uniform",
      value: 1_200,
    });
    expect(summarizeField([1_200, 800])).toEqual({ status: "mixed" });
    expect(summarizeField([1_200, undefined])).toEqual({ status: "mixed" });
  });

  test("includes missing selected edges when summarizing authored fields", () => {
    const document = applyEdgeEffect(createEmptyScenarioDocument(), {
      edgeIds: ["edge-a", "edge-b"],
      effect: {
        type: "edge.moving-dash",
        params: { direction: "forward" },
      },
      idFactory: ids(
        "scenario-1",
        "track-a",
        "clip-a",
        "track-b",
        "clip-b"
      ),
    });
    const mixed = patchEdgeEffects(document, {
      edgeIds: ["edge-b"],
      patch: { durationMs: 800 },
    });

    expect(
      summarizeEdgeEffectField(mixed, ["edge-a", "edge-b"], (clip) =>
        clip.durationMs
      )
    ).toEqual({ status: "mixed" });
    expect(
      summarizeEdgeEffectField(document, ["edge-a"], (clip) =>
        clip.effect.type
      )
    ).toEqual({ status: "uniform", value: "edge.moving-dash" });
    expect(
      summarizeEdgeEffectField(document, ["edge-a", "edge-missing"], (clip) =>
        clip.effect.type
      )
    ).toEqual({ status: "mixed" });
    expect(
      summarizeEdgeEffectField(document, ["edge-missing"], (clip) =>
        clip.effect.type
      )
    ).toEqual({ status: "none" });
  });

  test("treats independently cloned structured appearance values as uniform", () => {
    const document = applyEdgeEffect(createEmptyScenarioDocument(), {
      edgeIds: ["edge-a", "edge-b"],
      effect: {
        type: "edge.gradient-beam",
        params: { colors: ["#38bdf8", "#818cf8"] },
      },
      idFactory: ids(
        "scenario-1",
        "track-a",
        "clip-a",
        "track-b",
        "clip-b"
      ),
    });

    expect(
      summarizeEdgeEffectField(document, ["edge-a", "edge-b"], (clip) =>
        clip.effect.params.colors
      )
    ).toEqual({
      status: "uniform",
      value: ["#38bdf8", "#818cf8"],
    });
  });
});
