import type { PageScenarioDocumentV1, ScenarioV1 } from "./model";
import type { RequestFlowEdge } from "./request-flow";

export interface AuthoredCustomPath {
  nodeIds: string[];
  edgeIds: string[];
}

export interface NamedAuthoredCustomPath extends AuthoredCustomPath {
  scenarioId: string;
  name: string;
}

function findPathInScenario(
  scenario: ScenarioV1,
  edges: readonly RequestFlowEdge[]
): AuthoredCustomPath | null {
  const authored = scenario.tracks
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
    }))
    .sort((left, right) => left.startMs - right.startMs);
  if (authored.length === 0) return null;
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
  return {
    edgeIds: orderedEdges.map((edge) => edge!.id),
    nodeIds: [first.source, ...orderedEdges.map((edge) => edge!.target)],
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
