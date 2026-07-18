import type {
  AnimationDirectionV1,
  ScenarioClipV1,
} from "./model";
import type { ClipTimingPhase, ClipTimingResult } from "./timing";

export type EdgeMotionPreset =
  | "moving-dash"
  | "gradient-beam"
  | "packet"
  | "pulse"
  | "particle-stream";

export const MAX_PARTICLE_COUNT = 24;

interface CommonEdgeEffectProjection {
  supported: true;
  effectId: string;
  active: boolean;
  timingPhase: ClipTimingPhase;
  direction: AnimationDirectionV1;
  travelDirection: "forward" | "reverse";
  phases: number[];
  startOffset: number;
  endOffset: number;
  widthPx: number;
  opacity: number;
  colors: [string, string];
  glowColor: string;
  glowBlurPx: number;
}

export type SupportedEdgeEffectProjection =
  | (CommonEdgeEffectProjection & {
      effectType: "edge.moving-dash";
      preset: "moving-dash";
      dashLengthPx: number;
      gapLengthPx: number;
    })
  | (CommonEdgeEffectProjection & {
      effectType: "edge.gradient-beam";
      preset: "gradient-beam";
      trailLengthRatio: number;
    })
  | (CommonEdgeEffectProjection & {
      effectType: "edge.packet";
      preset: "packet";
      packetLengthRatio: number;
      sizePx: number;
    })
  | (CommonEdgeEffectProjection & {
      effectType: "edge.pulse";
      preset: "pulse";
    })
  | (CommonEdgeEffectProjection & {
      effectType: "edge.particle-stream";
      preset: "particle-stream";
      particleSizePx: number;
      count: number;
      spacingPx: number;
      distribution: "count" | "spacing";
    });

export type EdgeEffectProjection =
  | SupportedEdgeEffectProjection
  | {
      supported: false;
      effectId: string;
      effectType: string;
      preset: null;
      active: false;
      phases: [];
      reason: "unsupported-effect";
    };

const directionOf = (clip: ScenarioClipV1): AnimationDirectionV1 => {
  const value = clip.effect.params.direction;
  return value === "reverse" ||
    value === "bidirectional" ||
    value === "ping-pong"
    ? value
    : "forward";
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const numberParamAliases = (
  clip: ScenarioClipV1,
  keys: string[],
  fallback: number,
  min: number,
  max: number
) => {
  for (const key of keys) {
    const value = clip.effect.params[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return clamp(value, min, max);
    }
  }
  return fallback;
};

const stringParam = (clip: ScenarioClipV1, key: string, fallback: string) => {
  const value = clip.effect.params[key];
  return typeof value === "string" && value.trim() ? value : fallback;
};

const hasFiniteNumberParam = (clip: ScenarioClipV1, keys: string[]) =>
  keys.some((key) => {
    const value = clip.effect.params[key];
    return typeof value === "number" && Number.isFinite(value);
  });

const colorPair = (clip: ScenarioClipV1): [string, string] => {
  const defaults: [string, string] =
    clip.effect.type === "edge.gradient-beam"
      ? ["#ffaa40", "#9c40ff"]
      : ["#38bdf8", "#818cf8"];
  const value = clip.effect.params.colors;
  const authored = Array.isArray(value)
    ? value.filter(
        (color): color is string =>
          typeof color === "string" && color.trim().length > 0
      )
    : [];
  const primary = stringParam(
    clip,
    "color",
    authored[0] ?? defaults[0]
  );
  const secondary =
    authored[1] ?? stringParam(clip, "secondaryColor", defaults[1]);
  return [primary, secondary];
};

const pathOffsets = (clip: ScenarioClipV1) => {
  let startOffset = numberParamAliases(
    clip,
    ["startOffset"],
    0,
    0,
    0.98
  );
  let endOffset = numberParamAliases(clip, ["endOffset"], 0, 0, 0.98);
  const total = startOffset + endOffset;
  if (total > 0.98) {
    const scale = 0.98 / total;
    startOffset *= scale;
    endOffset *= scale;
  }
  return { startOffset, endOffset };
};

export function projectEdgeEffect(
  clip: ScenarioClipV1,
  timing: ClipTimingResult
): EdgeEffectProjection {
  if (
    clip.effect.type !== "edge.moving-dash" &&
    clip.effect.type !== "edge.gradient-beam" &&
    clip.effect.type !== "edge.packet" &&
    clip.effect.type !== "edge.pulse" &&
    clip.effect.type !== "edge.particle-stream"
  ) {
    return {
      supported: false,
      effectId: clip.id,
      effectType: clip.effect.type,
      preset: null,
      active: false,
      phases: [],
      reason: "unsupported-effect",
    };
  }

  const { startOffset, endOffset } = pathOffsets(clip);
  const pathSpan = 1 - startOffset - endOffset;
  const colors = colorPair(clip);
  const common = {
    supported: true,
    effectId: clip.id,
    active: timing.active,
    timingPhase: timing.phase,
    direction: directionOf(clip),
    travelDirection: timing.travelDirection,
    phases: timing.progresses.map(
      (phase) => startOffset + clamp(phase, 0, 1) * pathSpan
    ),
    startOffset,
    endOffset,
    widthPx: numberParamAliases(clip, ["widthPx"], 2, 0.5, 24),
    opacity: numberParamAliases(clip, ["opacity"], 1, 0, 1),
    colors,
    glowColor: stringParam(clip, "glowColor", colors[0]),
    glowBlurPx: numberParamAliases(
      clip,
      ["glowBlurPx", "glow"],
      0,
      0,
      32
    ),
  } as const;

  switch (clip.effect.type) {
    case "edge.gradient-beam":
      return {
        ...common,
        effectType: clip.effect.type,
        preset: "gradient-beam",
        trailLengthRatio: numberParamAliases(
          clip,
          ["trailLengthRatio", "trailLength"],
          0.1,
          0.02,
          0.95
        ),
      };

    case "edge.packet":
      return {
        ...common,
        effectType: clip.effect.type,
        preset: "packet",
        packetLengthRatio: numberParamAliases(
          clip,
          ["packetLengthRatio", "packetLength"],
          0.025,
          0.005,
          0.2
        ),
        sizePx: numberParamAliases(
          clip,
          ["sizePx", "packetSizePx"],
          6,
          1,
          32
        ),
      };

    case "edge.pulse":
      return {
        ...common,
        effectType: clip.effect.type,
        preset: "pulse",
      };

    case "edge.particle-stream": {
      const count = Math.round(
        numberParamAliases(
          clip,
          ["count", "particleCount"],
          8,
          1,
          MAX_PARTICLE_COUNT
        )
      );
      return {
        ...common,
        effectType: clip.effect.type,
        preset: "particle-stream",
        particleSizePx: numberParamAliases(
          clip,
          ["particleSizePx", "particleSize"],
          3,
          0.5,
          24
        ),
        count,
        spacingPx: numberParamAliases(
          clip,
          ["spacingPx", "particleSpacingPx"],
          12,
          1,
          128
        ),
        distribution:
          !hasFiniteNumberParam(clip, ["count", "particleCount"]) &&
          hasFiniteNumberParam(clip, ["spacingPx", "particleSpacingPx"])
            ? "spacing"
            : "count",
      };
    }

    case "edge.moving-dash":
      return {
        ...common,
        effectType: clip.effect.type,
        preset: "moving-dash",
        dashLengthPx: numberParamAliases(
          clip,
          ["dashLengthPx", "dashLength"],
          8,
          0.5,
          128
        ),
        gapLengthPx: numberParamAliases(
          clip,
          ["gapLengthPx", "gapLength"],
          6,
          0.5,
          128
        ),
      };
  }
}
