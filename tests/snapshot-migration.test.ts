import { describe, expect, test } from "bun:test";
import {
  migrateFlowSnapshotV1,
  normalizeFlowSnapshotV2,
} from "../src/animation/snapshot-migrations";

function legacySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    projectName: "Legacy",
    nodes: [],
    edges: [],
    customBlocks: [],
    groups: [],
    pages: [{ id: "page-1", name: "Page 1" }],
    activePageId: "page-1",
    pageContents: {},
    turbo: false,
    animateEdges: false,
    animationSpeed: 0.8,
    turboColors: ["#ec4899", "#3b82f6"] as [string, string],
    ...overrides,
  };
}

function legacyEdge(id: string, animated: boolean) {
  return {
    id,
    type: "labeled",
    source: `${id}-source`,
    target: `${id}-target`,
    animated,
    data: {
      label: `${id} label`,
      turbo: true,
      color: "#38bdf8",
      lineStyle: "solid",
      dashGap: 9,
    },
  };
}

describe("version 1 animation migration", () => {
  test("moves active animated edges into one deterministic default scenario", () => {
    const migrated = migrateFlowSnapshotV1(
      legacySnapshot({
        edges: [legacyEdge("edge-1", true), legacyEdge("edge-2", false)],
        animationSpeed: 1.25,
      })
    );

    expect(migrated.version).toBe(2);
    expect(migrated.edges.map((edge) => edge.animated)).toEqual([false, false]);
    expect(migrated.scenarioDocument.defaultScenarioId).toBe(
      "legacy-motion-page-1"
    );
    expect(migrated.scenarioDocument.scenarios).toHaveLength(1);
    const scenario = migrated.scenarioDocument.scenarios[0];
    expect(scenario.durationMs).toBe(1250);
    expect(scenario.playback.loop).toEqual({
      mode: "repeat",
      startMs: 0,
      endMs: 1250,
    });
    expect(scenario.tracks).toHaveLength(1);
    expect(scenario.tracks[0]).toMatchObject({
      id: "legacy-track-edge-1",
      target: { type: "edge", id: "edge-1" },
      property: "connection-effect",
      enabled: true,
    });
    expect(scenario.tracks[0].clips[0]).toMatchObject({
      id: "legacy-clip-edge-1",
      startMs: 0,
      durationMs: 1250,
      easing: "linear",
      repeatCount: 0,
      repeatDelayMs: 0,
      effect: {
        type: "edge.moving-dash",
        params: { direction: "forward", color: "#38bdf8" },
      },
    });

    expect(migrated.edges[0].data).toEqual(
      legacyEdge("edge-1", true).data
    );
  });

  test("migrates animated edges in inactive page contents", () => {
    const migrated = migrateFlowSnapshotV1(
      legacySnapshot({
        pages: [
          { id: "page-1", name: "Page 1" },
          { id: "page-2", name: "Page 2" },
        ],
        pageContents: {
          "page-2": {
            nodes: [],
            edges: [legacyEdge("inactive-edge", true)],
            groups: [],
          },
        },
      })
    );

    expect(migrated.scenarioDocument.scenarios).toHaveLength(0);
    expect(
      migrated.pageContents["page-2"].scenarioDocument.defaultScenarioId
    ).toBe("legacy-motion-page-2");
    expect(
      migrated.pageContents["page-2"].scenarioDocument.scenarios[0].tracks[0]
        .target
    ).toEqual({ type: "edge", id: "inactive-edge" });
    expect(migrated.pageContents["page-2"].edges[0].animated).toBe(false);
  });

  test("uses 800ms for invalid legacy speeds and creates no empty timeline", () => {
    const animated = migrateFlowSnapshotV1(
      legacySnapshot({
        edges: [legacyEdge("edge-1", true)],
        animationSpeed: Number.NaN,
      })
    );
    expect(animated.scenarioDocument.scenarios[0].durationMs).toBe(800);

    const still = migrateFlowSnapshotV1(
      legacySnapshot({ edges: [legacyEdge("edge-2", false)] })
    );
    expect(still.scenarioDocument).toEqual({
      schemaVersion: 1,
      scenarios: [],
      defaultScenarioId: null,
    });
  });

  test("preserves base edge appearance and project turbo settings", () => {
    const edge = legacyEdge("edge-1", true);
    const migrated = migrateFlowSnapshotV1(
      legacySnapshot({
        edges: [edge],
        turbo: true,
        turboColors: ["#111111", "#eeeeee"],
      })
    );

    expect(migrated.edges[0].data).toEqual(edge.data);
    expect(migrated.turbo).toBe(true);
    expect(migrated.turboColors).toEqual(["#111111", "#eeeeee"]);
  });
});

describe("version 2 normalization", () => {
  test("round-trips unknown effect types and parameters", () => {
    const snapshot = {
      ...migrateFlowSnapshotV1(legacySnapshot()),
      scenarioDocument: {
        schemaVersion: 1 as const,
        defaultScenarioId: "future",
        scenarios: [
          {
            id: "future",
            name: "Future",
            durationMs: 900,
            playback: {
              rate: 1,
              loop: { mode: "none" as const, startMs: 0, endMs: 900 },
            },
            tracks: [
              {
                id: "future-track",
                target: { type: "edge" as const, id: "edge-future" },
                property: "connection-effect",
                enabled: true,
                clips: [
                  {
                    id: "future-clip",
                    startMs: 0,
                    durationMs: 900,
                    easing: "future-ease",
                    repeatCount: 0,
                    repeatDelayMs: 0,
                    effect: {
                      type: "edge.future-ribbon",
                      params: {
                        nested: { retained: true },
                        values: [1, "two", null],
                      },
                    },
                  },
                ],
              },
            ],
            markers: [{ id: "m", name: "Marker", atMs: 10 }],
            triggers: [{ id: "t", type: "future", params: { x: 1 } }],
          },
        ],
      },
    };

    expect(normalizeFlowSnapshotV2(snapshot)).toEqual(snapshot);
  });

  test("rejects malformed scenario documents", () => {
    const snapshot = migrateFlowSnapshotV1(legacySnapshot());
    expect(() =>
      normalizeFlowSnapshotV2({
        ...snapshot,
        scenarioDocument: { schemaVersion: 2, scenarios: [] },
      })
    ).toThrow("Unsupported scenario schema version");
  });
});
