import { describe, expect, test } from "bun:test";
import type { PageScenarioDocumentV1, ScenarioTrackV1 } from "../src/animation/model";
import { findAuthoredCustomPath } from "../src/animation/custom-path";
import {
  applyNodeBorderEntrySides,
  normalizeGradientBeamDefaults,
} from "../src/animation/gradient-beam";

const track = (edgeId: string, startMs: number): ScenarioTrackV1 => ({
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
      effect: { type: "edge.gradient-beam", params: {} },
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
