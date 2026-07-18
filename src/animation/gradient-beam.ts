import {
  fitScenarioToClips,
  type ScenarioClipPatchV1,
} from "./scenario-document";
import type {
  PageScenarioDocumentV1,
  ScenarioEffectV1,
  ScenarioV1,
} from "./model";

export const GRADIENT_BEAM_DURATION_MS = 1_500;
export const NODE_BORDER_DURATION_MS = 800;
export const REQUEST_FLOW_ARRIVAL_LEAD_MS = 200;
export const REQUEST_FLOW_EDGE_DELAY_MS = NODE_BORDER_DURATION_MS;
export const REQUEST_FLOW_HOP_DELAY_MS =
  NODE_BORDER_DURATION_MS +
  GRADIENT_BEAM_DURATION_MS -
  REQUEST_FLOW_ARRIVAL_LEAD_MS;

export function createGradientBeamEffect(): ScenarioEffectV1 {
  return {
    type: "edge.gradient-beam",
    params: {
      direction: "forward",
      colors: ["#ffaa40", "#9c40ff"],
      widthPx: 2,
      opacity: 1,
      trailLength: 0.1,
      glowBlurPx: 0,
    },
  };
}

export function createGradientBeamClip(
  startMs = 0
): ScenarioClipPatchV1 {
  return {
    startMs,
    durationMs: GRADIENT_BEAM_DURATION_MS,
    easing: "linear",
    repeatCount: 0,
    repeatDelayMs: 0,
  };
}

export function createNodeBorderEffect(): ScenarioEffectV1 {
  return {
    type: "node.border-beam",
    params: { colors: ["#ffaa40", "#9c40ff"] },
  };
}

export function createNodeBorderClip(startMs = 0): ScenarioClipPatchV1 {
  return {
    startMs,
    durationMs: NODE_BORDER_DURATION_MS,
    easing: "linear",
    repeatCount: 0,
    repeatDelayMs: 0,
  };
}

const uniqueStarts = (
  scenario: ScenarioV1,
  property: string,
  effectType: string
) =>
  [
    ...new Set(
      scenario.tracks
        .filter((track) => track.property === property)
        .flatMap((track) =>
          track.clips
            .filter((clip) => clip.effect.type === effectType)
            .map((clip) => clip.startMs)
        )
    ),
  ].sort((left, right) => left - right);

const normalizeRequestFlowSchedule = (scenario: ScenarioV1): ScenarioV1 => {
  const edgeStarts = uniqueStarts(
    scenario,
    "connection-effect",
    "edge.gradient-beam"
  );
  const nodeStarts = uniqueStarts(
    scenario,
    "node-effect",
    "node.border-beam"
  );
  if (
    edgeStarts.length === 0 ||
    nodeStarts.length !== edgeStarts.length + 1
  ) {
    return scenario;
  }

  const edgeSchedule = new Map(
    edgeStarts.map((startMs, index) => [
      startMs,
      REQUEST_FLOW_EDGE_DELAY_MS + index * REQUEST_FLOW_HOP_DELAY_MS,
    ])
  );
  const nodeSchedule = new Map(
    nodeStarts.map((startMs, index) => [
      startMs,
      index * REQUEST_FLOW_HOP_DELAY_MS,
    ])
  );
  let changed = false;
  const tracks = scenario.tracks.map((track) => {
    const clips = track.clips.map((clip) => {
      const schedule =
        track.property === "connection-effect" &&
        clip.effect.type === "edge.gradient-beam"
          ? edgeSchedule
          : track.property === "node-effect" &&
              clip.effect.type === "node.border-beam"
            ? nodeSchedule
            : null;
      const startMs = schedule?.get(clip.startMs);
      if (startMs === undefined || startMs === clip.startMs) return clip;
      changed = true;
      return { ...clip, startMs };
    });
    return { ...track, clips };
  });

  return changed ? fitScenarioToClips({ ...scenario, tracks }) : scenario;
};

export function normalizeGradientBeamDefaults(
  document: PageScenarioDocumentV1
): PageScenarioDocumentV1 {
  let changed = false;
  const scenarios = document.scenarios.map((scenario) => {
    const tracks = scenario.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (
          clip.effect.type !== "edge.gradient-beam" ||
          clip.durationMs !== 5_000 ||
          clip.easing !== "cubic-bezier(0.16, 1, 0.3, 1)"
        ) {
          return clip;
        }
        changed = true;
        return {
          ...clip,
          durationMs: GRADIENT_BEAM_DURATION_MS,
          easing: "linear",
        };
      }),
    }));
    const normalized = fitScenarioToClips({ ...scenario, tracks });
    const repaired = normalizeRequestFlowSchedule(normalized);
    if (repaired !== normalized) changed = true;
    return repaired;
  });
  return changed ? { ...document, scenarios } : document;
}
