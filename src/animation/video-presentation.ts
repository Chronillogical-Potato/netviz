export const VIDEO_START_DELAY_MS = 3_000;

type ScheduleVideoStart = (
  callback: () => void,
  delayMs: number
) => () => void;

const scheduleWithTimeout: ScheduleVideoStart = (callback, delayMs) => {
  const timer = window.setTimeout(callback, delayMs);
  return () => window.clearTimeout(timer);
};

let cancelPendingStart: (() => void) | null = null;

export function beginVideoPresentation(
  actions: {
    enterPreview: () => void;
    startPlayback: () => void;
  },
  schedule: ScheduleVideoStart = scheduleWithTimeout
) {
  cancelPendingVideoPresentation();
  actions.enterPreview();
  cancelPendingStart = schedule(() => {
    cancelPendingStart = null;
    actions.startPlayback();
  }, VIDEO_START_DELAY_MS);
}

export function cancelPendingVideoPresentation() {
  cancelPendingStart?.();
  cancelPendingStart = null;
}
