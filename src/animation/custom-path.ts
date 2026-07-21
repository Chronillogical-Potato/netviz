import type { PageScenarioDocumentV1, ScenarioV1 } from "./model";
import type { RequestFlowEdge } from "./request-flow";

export type AnimationPathPreset =
  | "single-line"
  | "bidirectional"
  | "multiple-inputs"
  | "multiple-outputs"
  | "request-response"
  | "scatter-gather"
  | "round-robin"
  // Kept only so previously saved staggered paths can be reopened.
  | "staggered-outputs"
  | "failover"
  | "cascade"
  | "loop";

const PATH_PRESETS = new Set<AnimationPathPreset>([
  "single-line",
  "bidirectional",
  "multiple-inputs",
  "multiple-outputs",
  "request-response",
  "scatter-gather",
  "round-robin",
  "staggered-outputs",
  "failover",
  "cascade",
  "loop",
]);

export interface AuthoredCustomPath {
  preset: AnimationPathPreset;
  staggerMs?: number;
  nodeIds: string[];
  edgeIds: string[];
}

export interface NamedAuthoredCustomPath extends AuthoredCustomPath {
  scenarioId: string;
  name: string;
}

export const PLAY_ALL_CUSTOM_PATHS_SCENARIO_ID =
  "__netviz-play-all-custom-paths__";

export interface SequentialPlaybackDelays {
  betweenMs: number;
  endMs: number;
}

const safeDelay = (value: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;

export function buildSequentialCustomPathScenario(
  document: PageScenarioDocumentV1,
  edges: readonly RequestFlowEdge[],
  delays: number | SequentialPlaybackDelays = 400
): ScenarioV1 | null {
  const paths = findAuthoredCustomPaths(document, edges);
  const scenarios = paths.flatMap((path) => {
    const scenario = document.scenarios.find(
      (candidate) => candidate.id === path.scenarioId
    );
    return scenario ? [scenario] : [];
  });
  if (scenarios.length === 0) return null;

  const betweenDelayMs =
    typeof delays === "number"
      ? safeDelay(delays, 400)
      : safeDelay(delays.betweenMs, 400);
  const endDelayMs =
    typeof delays === "number" ? 0 : safeDelay(delays.endMs, 0);
  let offsetMs = 0;
  const markers: ScenarioV1["markers"] = [];
  const tracks = scenarios.flatMap((scenario, index) => {
    markers.push({
      id: `animation-start-${scenario.id}`,
      name: scenario.name,
      atMs: offsetMs,
    });
    const shifted = scenario.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({
        ...clip,
        startMs: clip.startMs + offsetMs,
      })),
    }));
    offsetMs += scenario.durationMs;
    if (index < scenarios.length - 1) offsetMs += betweenDelayMs;
    return shifted;
  });
  offsetMs += endDelayMs;

  return {
    id: PLAY_ALL_CUSTOM_PATHS_SCENARIO_ID,
    name: "Play all animations",
    durationMs: offsetMs,
    playback: {
      rate: 1,
      loop: { mode: "repeat", startMs: 0, endMs: offsetMs },
    },
    tracks,
    markers,
    triggers: [],
  };
}

function findPathInScenario(
  scenario: ScenarioV1,
  edges: readonly RequestFlowEdge[]
): AuthoredCustomPath | null {
  let authored = scenario.tracks
    .filter(
      (track) =>
        track.enabled &&
        track.property === "connection-effect" &&
        track.target.type === "edge" &&
        "id" in track.target &&
        track.clips[0]?.effect.type === "edge.gradient-beam"
    )
    .map((track) => ({
      edgeId: "id" in track.target ? track.target.id : "",
      startMs: track.clips[0]?.startMs ?? 0,
      preset: track.clips[0]?.effect.params.pathPreset,
      phase: track.clips[0]?.effect.params.pathPhase,
      staggerMs: track.clips[0]?.effect.params.staggerMs,
    }));
  if (authored.length === 0) return null;
  const authoredPreset = authored[0]?.preset;
  const storedPreset =
    typeof authoredPreset === "string" &&
    PATH_PRESETS.has(authoredPreset as AnimationPathPreset)
      ? (authoredPreset as AnimationPathPreset)
      : "single-line";
  const preset: AnimationPathPreset =
    storedPreset === "staggered-outputs"
      ? "multiple-outputs"
      : storedPreset;
  if (
    authored.some(
      (item) =>
        item.preset !== undefined && item.preset !== storedPreset
    )
  ) {
    return null;
  }
  if (preset === "request-response") {
    authored = authored.filter((item) => item.phase !== "response");
  }

  const linearPreset =
    preset === "single-line" ||
    preset === "request-response" ||
    preset === "loop";
  if (!linearPreset) {
    const orderedEdges = authored.map((item) =>
      edges.find((edge) => edge.id === item.edgeId)
    );
    if (orderedEdges.some((edge) => edge === undefined)) return null;
    const resolved = orderedEdges as RequestFlowEdge[];
    if (preset === "bidirectional") {
      const edge = resolved[0];
      if (resolved.length !== 1 || !edge) return null;
      return {
        preset,
        edgeIds: [edge.id],
        nodeIds: [edge.source, edge.target],
      };
    }
    if (preset === "multiple-inputs") {
      const hubId = resolved[0]?.target;
      if (!hubId || resolved.some((edge) => edge.target !== hubId)) return null;
      return {
        preset,
        edgeIds: resolved.map((edge) => edge.id),
        nodeIds: [hubId, ...resolved.map((edge) => edge.source)],
      };
    }
    if (preset === "scatter-gather") {
      const scatter = resolved.filter(
        (_, index) => authored[index]?.phase === "scatter"
      );
      const gather = resolved.filter(
        (_, index) => authored[index]?.phase === "gather"
      );
      const sourceId = scatter[0]?.source;
      const resultId = gather[0]?.target;
      const workers = scatter.map((edge) => edge.target);
      if (
        !sourceId ||
        !resultId ||
        workers.length < 2 ||
        scatter.some((edge) => edge.source !== sourceId) ||
        gather.length !== workers.length ||
        gather.some(
          (edge) => edge.target !== resultId || !workers.includes(edge.source)
        )
      ) {
        return null;
      }
      return {
        preset,
        edgeIds: [...scatter, ...gather].map((edge) => edge.id),
        nodeIds: [sourceId, ...workers, resultId],
      };
    }
    if (preset === "cascade") {
      const targets = new Set(resolved.map((edge) => edge.target));
      const rootId = resolved.find((edge) => !targets.has(edge.source))?.source;
      if (!rootId) return null;
      const included = new Set([rootId]);
      const nodeIds = [rootId];
      for (const edge of resolved) {
        if (!included.has(edge.source) || included.has(edge.target)) return null;
        included.add(edge.target);
        nodeIds.push(edge.target);
      }
      return {
        preset,
        edgeIds: resolved.map((edge) => edge.id),
        nodeIds,
      };
    }
    const hubId = resolved[0]?.source;
    if (!hubId || resolved.some((edge) => edge.source !== hubId)) return null;
    const result: AuthoredCustomPath = {
      preset,
      edgeIds: resolved.map((edge) => edge.id),
      nodeIds: [hubId, ...resolved.map((edge) => edge.target)],
    };
    const staggerMs = authored[0]?.staggerMs;
    if (preset === "multiple-outputs" && typeof staggerMs === "number") {
      result.staggerMs = staggerMs;
    }
    return result;
  }

  authored.sort((left, right) => left.startMs - right.startMs);
  if (
    authored.some(
      (item, index) =>
        index > 0 && item.startMs <= authored[index - 1].startMs
    )
  ) {
    return null;
  }

  const orderedEdges = authored.map((item) =>
    edges.find((edge) => edge.id === item.edgeId)
  );
  if (orderedEdges.some((edge) => edge === undefined)) return null;
  for (let index = 1; index < orderedEdges.length; index += 1) {
    if (orderedEdges[index - 1]?.target !== orderedEdges[index]?.source) {
      return null;
    }
  }

  const first = orderedEdges[0];
  if (!first) return null;
  const nodeIds = [first.source, ...orderedEdges.map((edge) => edge!.target)];
  if (preset === "loop" && nodeIds[0] !== nodeIds[nodeIds.length - 1]) {
    return null;
  }
  return {
    preset,
    edgeIds: orderedEdges.map((edge) => edge!.id),
    nodeIds,
  };
}

export function findAuthoredCustomPaths(
  document: PageScenarioDocumentV1,
  edges: readonly RequestFlowEdge[]
): NamedAuthoredCustomPath[] {
  return document.scenarios.flatMap((scenario) => {
    const path = findPathInScenario(scenario, edges);
    return path
      ? [{ ...path, scenarioId: scenario.id, name: scenario.name }]
      : [];
  });
}

export function findAuthoredCustomPath(
  document: PageScenarioDocumentV1,
  edges: readonly RequestFlowEdge[]
): AuthoredCustomPath | null {
  const scenario =
    document.scenarios.find(
      (candidate) => candidate.id === document.defaultScenarioId
    ) ?? document.scenarios[0];
  if (!scenario) return null;
  return findPathInScenario(scenario, edges);
}
