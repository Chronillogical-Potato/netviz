import type { PageScenarioDocumentV1, ScenarioV1 } from "./model";
import { ScenarioRuntime } from "./runtime";
import type { AnimationFrameScheduler } from "./clock";

let fallbackFrameId = 0;
const fallbackFrames = new Map<number, ReturnType<typeof setTimeout>>();

const scheduler: AnimationFrameScheduler = {
  now: () => performance.now(),
  requestFrame: (callback) => {
    if (typeof requestAnimationFrame === "function") {
      return requestAnimationFrame(callback);
    }
    const id = ++fallbackFrameId;
    const handle = setTimeout(() => {
      fallbackFrames.delete(id);
      callback(performance.now());
    }, 16);
    fallbackFrames.set(id, handle);
    return id;
  },
  cancelFrame: (id) => {
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(id);
      return;
    }
    const handle = fallbackFrames.get(id);
    if (handle !== undefined) clearTimeout(handle);
    fallbackFrames.delete(id);
  },
};

export const scenarioRuntime = new ScenarioRuntime(scheduler);

export function getDefaultScenario(
  document: PageScenarioDocumentV1
): ScenarioV1 | null {
  const id = document.defaultScenarioId;
  if (id === null) return null;
  return document.scenarios.find((scenario) => scenario.id === id) ?? null;
}

export function prefersReducedMotion(
  preference: "system" | "full" | "reduced"
): boolean {
  if (preference === "full") return false;
  if (preference === "reduced") return true;
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
