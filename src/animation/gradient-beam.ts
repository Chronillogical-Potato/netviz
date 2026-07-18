import {
  fitScenarioToClips,
  type ScenarioClipPatchV1,
} from "./scenario-document";
import type { PageScenarioDocumentV1, ScenarioEffectV1 } from "./model";

export const GRADIENT_BEAM_DURATION_MS = 1_500;
export const REQUEST_FLOW_HOP_DELAY_MS = GRADIENT_BEAM_DURATION_MS;

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
    return fitScenarioToClips({ ...scenario, tracks });
  });
  return changed ? { ...document, scenarios } : document;
}
