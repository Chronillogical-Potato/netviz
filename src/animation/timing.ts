import type { ScenarioClipV1 } from "./model";

export type ClipTimingPhase = "before" | "active" | "repeat-delay" | "after";
export type MotionDirection =
  | "forward"
  | "reverse"
  | "bidirectional"
  | "ping-pong";

export interface ClipTimingResult {
  phase: ClipTimingPhase;
  active: boolean;
  iteration: number;
  localTimeMs: number;
  progress: number;
  progresses: number[];
  travelDirection: "forward" | "reverse";
}

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const getDirection = (clip: ScenarioClipV1): MotionDirection => {
  const direction = clip.effect.params.direction;
  if (
    direction === "reverse" ||
    direction === "bidirectional" ||
    direction === "ping-pong"
  ) {
    return direction;
  }
  return "forward";
};

const applyEasing = (progress: number, easing: string) => {
  const value = clamp01(progress);
  switch (easing) {
    case "ease-in":
      return value * value;
    case "ease-out":
      return 1 - (1 - value) * (1 - value);
    case "ease":
    case "ease-in-out":
      return value < 0.5
        ? 2 * value * value
        : 1 - Math.pow(-2 * value + 2, 2) / 2;
    default:
      return value;
  }
};

const projectProgress = (
  direction: MotionDirection,
  rawProgress: number
): Pick<ClipTimingResult, "progress" | "progresses" | "travelDirection"> => {
  const progress = clamp01(rawProgress);
  if (direction === "reverse") {
    return {
      progress: 1 - progress,
      progresses: [1 - progress],
      travelDirection: "reverse",
    };
  }
  if (direction === "bidirectional") {
    return {
      progress,
      progresses: [progress, 1 - progress],
      travelDirection: "forward",
    };
  }
  if (direction === "ping-pong") {
    const returning = progress > 0.5;
    const pingPongProgress = returning
      ? (1 - progress) * 2
      : progress * 2;
    return {
      progress: pingPongProgress,
      progresses: [pingPongProgress],
      travelDirection: returning ? "reverse" : "forward",
    };
  }
  return {
    progress,
    progresses: [progress],
    travelDirection: "forward",
  };
};

const result = (
  clip: ScenarioClipV1,
  phase: ClipTimingPhase,
  active: boolean,
  iteration: number,
  localTimeMs: number,
  rawProgress: number
): ClipTimingResult => ({
  phase,
  active,
  iteration,
  localTimeMs,
  ...projectProgress(
    getDirection(clip),
    applyEasing(rawProgress, clip.easing)
  ),
});

/**
 * Evaluates authored clip timing from absolute scenario time. `repeatCount`
 * counts repeats after the first iteration, matching CSS/Web Animations usage.
 */
export const evaluateClipTiming = (
  clip: ScenarioClipV1,
  scenarioTimeMs: number
): ClipTimingResult => {
  const startMs = finiteOr(clip.startMs, 0);
  const durationMs = Math.max(0, finiteOr(clip.durationMs, 0));
  const repeatDelayMs = Math.max(0, finiteOr(clip.repeatDelayMs, 0));
  const timelineMs = finiteOr(scenarioTimeMs, startMs);

  if (durationMs === 0) {
    return result(
      clip,
      timelineMs < startMs ? "before" : "after",
      false,
      0,
      0,
      timelineMs < startMs ? 0 : 1
    );
  }

  if (timelineMs < startMs) {
    return result(clip, "before", false, 0, 0, 0);
  }

  const repeatCount =
    clip.repeatCount === "infinite"
      ? "infinite"
      : Math.max(0, Math.floor(finiteOr(clip.repeatCount, 0)));
  const cycleMs = durationMs + repeatDelayMs;
  const elapsedMs = timelineMs - startMs;
  const totalIterations = repeatCount === "infinite" ? Infinity : repeatCount + 1;
  const totalDurationMs =
    totalIterations === Infinity
      ? Infinity
      : totalIterations * durationMs +
        Math.max(0, totalIterations - 1) * repeatDelayMs;

  if (elapsedMs >= totalDurationMs) {
    const finalIteration = Math.max(0, totalIterations - 1);
    return result(clip, "after", false, finalIteration, durationMs, 1);
  }

  const iteration = Math.floor(elapsedMs / cycleMs);
  const localTimeMs = elapsedMs - iteration * cycleMs;
  if (localTimeMs >= durationMs) {
    return result(clip, "repeat-delay", false, iteration, durationMs, 1);
  }

  return result(
    clip,
    "active",
    true,
    iteration,
    localTimeMs,
    localTimeMs / durationMs
  );
};
