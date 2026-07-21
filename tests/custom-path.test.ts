import { describe, expect, test } from "bun:test";
import type { PageScenarioDocumentV1, ScenarioTrackV1 } from "../src/animation/model";
import {
  buildSequentialCustomPathScenario,
  findAuthoredCustomPath,
  findAuthoredCustomPaths,
} from "../src/animation/custom-path";
import {
  applyNodeBorderEntrySides,
  normalizeGradientBeamDefaults,
} from "../src/animation/gradient-beam";

const track = (
  edgeId: string,
  startMs: number,
  params: ScenarioTrackV1["clips"][number]["effect"]["params"] = {}
): ScenarioTrackV1 => ({
  id: `track-${edgeId}`,
  target: { type: "edge", id: edgeId },
  property: "connection-effect",
  enabled: true,
  clips: [
    {
      id: `clip-${edgeId}`,
      startMs,
      durationMs: 1_500,
      easing: "linear",
      repeatCount: 0,
      repeatDelayMs: 0,
      effect: { type: "edge.gradient-beam", params },
    },
  ],
});

const nodeTrack = (nodeId: string, startMs: number): ScenarioTrackV1 => ({
  ...track(nodeId, startMs),
  id: `track-${nodeId}`,
  target: { type: "node", id: nodeId },
  property: "node-effect",
  clips: [
    {
      ...track(nodeId, startMs).clips[0],
      id: `clip-${nodeId}`,
      durationMs: 800,
      effect: { type: "node.border-beam", params: {} },
    },
  ],
});

const document = (tracks: ScenarioTrackV1[]): PageScenarioDocumentV1 => ({
  schemaVersion: 1,
  defaultScenarioId: "scenario-1",
  scenarios: [
    {
      id: "scenario-1",
      name: "Default scenario",
      durationMs: 4_000,
      playback: {
        rate: 1,
        loop: { mode: "repeat", startMs: 0, endMs: 4_000 },
      },
      tracks,
      markers: [],
      triggers: [],
    },
  ],
});

describe("authored custom paths", () => {
  test("reconstructs every named path from its own scenario", () => {
    const first = document([track("user-firewall", 0)]).scenarios[0];
    const second = {
      ...document([track("proxy-server", 0)]).scenarios[0],
      id: "scenario-2",
      name: "Checkout",
    };

    expect(
      findAuthoredCustomPaths(
        {
          schemaVersion: 1,
          defaultScenarioId: second.id,
          scenarios: [{ ...first, name: "Login" }, second],
        },
        [
          { id: "user-firewall", source: "user", target: "firewall" },
          { id: "proxy-server", source: "proxy", target: "server" },
        ]
      )
    ).toEqual([
      {
        scenarioId: "scenario-1",
        name: "Login",
        preset: "single-line",
        nodeIds: ["user", "firewall"],
        edgeIds: ["user-firewall"],
      },
      {
        scenarioId: "scenario-2",
        name: "Checkout",
        preset: "single-line",
        nodeIds: ["proxy", "server"],
        edgeIds: ["proxy-server"],
      },
    ]);
  });

  test("builds one ordered playback scenario from every custom path", () => {
    const first = {
      ...document([track("user-firewall", 0)]).scenarios[0],
      name: "Login",
    };
    const second = {
      ...document([track("proxy-server", 0)]).scenarios[0],
      id: "scenario-2",
      name: "Checkout",
    };
    const combined = buildSequentialCustomPathScenario(
      {
        schemaVersion: 1,
        defaultScenarioId: first.id,
        scenarios: [first, second],
      },
      [
        { id: "user-firewall", source: "user", target: "firewall" },
        { id: "proxy-server", source: "proxy", target: "server" },
      ]
    );

    expect(combined?.name).toBe("Play all animations");
    expect(
      combined?.tracks.map((item) => item.clips[0]?.startMs)
    ).toEqual([0, 4_400]);
    expect(combined?.durationMs).toBe(8_400);
    expect(combined?.playback.loop).toEqual({
      mode: "repeat",
      startMs: 0,
      endMs: 8_400,
    });
  });

  test("uses the requested gap and marks each animation start", () => {
    const first = {
      ...document([track("user-firewall", 0)]).scenarios[0],
      name: "Login",
    };
    const second = {
      ...document([track("proxy-server", 0)]).scenarios[0],
      id: "scenario-2",
      name: "Checkout",
    };

    const combined = buildSequentialCustomPathScenario(
      {
        schemaVersion: 1,
        defaultScenarioId: first.id,
        scenarios: [first, second],
      },
      [
        { id: "user-firewall", source: "user", target: "firewall" },
        { id: "proxy-server", source: "proxy", target: "server" },
      ],
      1_200
    );

    expect(combined?.tracks.map((item) => item.clips[0]?.startMs)).toEqual([
      0,
      5_200,
    ]);
    expect(combined?.durationMs).toBe(9_200);
    expect(combined?.markers).toEqual([
      { id: "animation-start-scenario-1", name: "Login", atMs: 0 },
      {
        id: "animation-start-scenario-2",
        name: "Checkout",
        atMs: 5_200,
      },
    ]);
  });

  test("reconstructs a connected path from persisted scenario timing", () => {
    expect(
      findAuthoredCustomPath(
        document([
          track("firewall-proxy", 1_500),
          track("user-firewall", 0),
          {
            ...track("firewall-border", 1_500),
            target: { type: "node", id: "firewall" },
            property: "node-effect",
          },
        ]),
        [
          { id: "user-firewall", source: "user", target: "firewall" },
          { id: "firewall-proxy", source: "firewall", target: "proxy" },
        ]
      )
    ).toEqual({
      preset: "single-line",
      nodeIds: ["user", "firewall", "proxy"],
      edgeIds: ["user-firewall", "firewall-proxy"],
    });
  });

  test("does not misidentify simultaneous or branching effects as a custom path", () => {
    const edges = [
      { id: "user-a", source: "user", target: "a" },
      { id: "user-b", source: "user", target: "b" },
    ];
    expect(
      findAuthoredCustomPath(
        document([track("user-a", 0), track("user-b", 0)]),
        edges
      )
    ).toBeNull();
  });

  test("reconstructs bidirectional and branching path presets", () => {
    const bidirectional = {
      ...document([
        track("a-b", 800, {
          pathPreset: "bidirectional",
          direction: "bidirectional",
        }),
      ]).scenarios[0],
      id: "bidirectional",
      name: "Two way",
    };
    const inputs = {
      ...document([
        track("a-hub", 800, { pathPreset: "multiple-inputs" }),
        track("b-hub", 800, { pathPreset: "multiple-inputs" }),
      ]).scenarios[0],
      id: "inputs",
      name: "Inbound",
    };
    const outputs = {
      ...document([
        track("hub-a", 800, { pathPreset: "multiple-outputs" }),
        track("hub-b", 800, { pathPreset: "multiple-outputs" }),
      ]).scenarios[0],
      id: "outputs",
      name: "Outbound",
    };
    const paths = findAuthoredCustomPaths(
      {
        schemaVersion: 1,
        defaultScenarioId: bidirectional.id,
        scenarios: [bidirectional, inputs, outputs],
      },
      [
        { id: "a-b", source: "a", target: "b" },
        { id: "a-hub", source: "a", target: "hub" },
        { id: "b-hub", source: "b", target: "hub" },
        { id: "hub-a", source: "hub", target: "a" },
        { id: "hub-b", source: "hub", target: "b" },
      ]
    );

    expect(paths.map(({ scenarioId, preset, nodeIds, edgeIds }) => ({
      scenarioId,
      preset,
      nodeIds,
      edgeIds,
    }))).toEqual([
      {
        scenarioId: "bidirectional",
        preset: "bidirectional",
        nodeIds: ["a", "b"],
        edgeIds: ["a-b"],
      },
      {
        scenarioId: "inputs",
        preset: "multiple-inputs",
        nodeIds: ["hub", "a", "b"],
        edgeIds: ["a-hub", "b-hub"],
      },
      {
        scenarioId: "outputs",
        preset: "multiple-outputs",
        nodeIds: ["hub", "a", "b"],
        edgeIds: ["hub-a", "hub-b"],
      },
    ]);
  });

  test("reopens legacy staggered outputs as customized multiple outputs", () => {
    const legacy = {
      ...document([
        track("hub-a", 800, {
          pathPreset: "staggered-outputs",
          staggerMs: 400,
        }),
        track("hub-b", 1_200, {
          pathPreset: "staggered-outputs",
          staggerMs: 400,
        }),
      ]).scenarios[0],
      id: "legacy-staggered",
      name: "Legacy staggered",
    };

    expect(
      findAuthoredCustomPaths(
        {
          schemaVersion: 1,
          defaultScenarioId: legacy.id,
          scenarios: [legacy],
        },
        [
          { id: "hub-a", source: "hub", target: "a" },
          { id: "hub-b", source: "hub", target: "b" },
        ]
      )[0]
    ).toMatchObject({
      preset: "multiple-outputs",
      staggerMs: 400,
      nodeIds: ["hub", "a", "b"],
    });
  });

  test("repairs persisted paths whose edges overlap their block shimmer", () => {
    const normalized = applyNodeBorderEntrySides(
      normalizeGradientBeamDefaults(
        document([
          track("user-firewall", 0),
          track("firewall-proxy", 1_500),
          nodeTrack("user", 0),
          nodeTrack("firewall", 1_500),
          nodeTrack("proxy", 3_000),
        ])
      ),
      [
        {
          id: "user-firewall",
          target: "firewall",
          targetHandle: "right",
        },
        {
          id: "firewall-proxy",
          target: "proxy",
          targetHandle: "top",
        },
      ]
    );
    const scenario = normalized.scenarios[0];

    expect(
      scenario.tracks
        .filter((item) => item.property === "connection-effect")
        .map((item) => item.clips[0].startMs)
    ).toEqual([800, 2_900]);
    expect(
      scenario.tracks
        .filter((item) => item.property === "node-effect")
        .map((item) => item.clips[0].startMs)
    ).toEqual([0, 2_100, 4_200]);
    expect(
      scenario.tracks
        .filter((item) => item.property === "node-effect")
        .map((item) => item.clips[0].effect.params.entrySide)
    ).toEqual(["left", "right", "top"]);
    expect(scenario.durationMs).toBe(5_000);
  });
});
