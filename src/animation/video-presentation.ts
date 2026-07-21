export const VIDEO_START_DELAY_MS = 3_000;

export type VideoPresentationViewportSnapshot = {
  viewport: { x: number; y: number; zoom: number };
  frame: { left: number; top: number };
};

type ScheduleVideoStart = (
  callback: () => void,
  delayMs: number
) => () => void;

const scheduleWithTimeout: ScheduleVideoStart = (callback, delayMs) => {
  const timer = window.setTimeout(callback, delayMs);
  return () => window.clearTimeout(timer);
};

let cancelPendingStart: (() => void) | null = null;
let pendingViewport: VideoPresentationViewportSnapshot | null = null;

export function stageVideoPresentationViewport(
  snapshot: VideoPresentationViewportSnapshot
) {
  pendingViewport = snapshot;
}

export function takeVideoPresentationViewport() {
  const snapshot = pendingViewport;
  pendingViewport = null;
  return snapshot;
}

export function beginVideoPresentation(
  actions: {
    enterPreview: () => void;
    startPlayback: () => void;
  },
  delayMs = VIDEO_START_DELAY_MS,
  schedule: ScheduleVideoStart = scheduleWithTimeout
) {
  cancelPendingVideoPresentation();
  actions.enterPreview();
  cancelPendingStart = schedule(() => {
    cancelPendingStart = null;
    actions.startPlayback();
  }, Math.max(0, Math.round(delayMs)));
}

export function cancelPendingVideoPresentation() {
  cancelPendingStart?.();
  cancelPendingStart = null;
  pendingViewport = null;
}
