import { describe, expect, test } from "vitest";
import {
  VIDEO_START_DELAY_MS,
  beginVideoPresentation,
  cancelPendingVideoPresentation,
} from "../src/animation/video-presentation";

describe("Video presentation launch", () => {
  test("hands the editor viewport to the fullscreen presentation once", async () => {
    const presentationModule = (await import(
      "../src/animation/video-presentation"
    )) as typeof import("../src/animation/video-presentation") & {
      stageVideoPresentationViewport?: (snapshot: {
        viewport: { x: number; y: number; zoom: number };
        frame: { left: number; top: number };
      }) => void;
      takeVideoPresentationViewport?: () => unknown;
    };
    const stageViewport =
      presentationModule.stageVideoPresentationViewport;
    const takeViewport = presentationModule.takeVideoPresentationViewport;
    expect(typeof stageViewport).toBe("function");
    expect(typeof takeViewport).toBe("function");
    if (!stageViewport || !takeViewport) return;

    const snapshot = {
      viewport: { x: 120, y: 90, zoom: 0.85 },
      frame: { left: 251, top: 52 },
    };
    stageViewport(snapshot);

    expect(takeViewport()).toEqual(snapshot);
    expect(takeViewport()).toBeNull();
  });

  test("hides the editor immediately and starts playback after three seconds", () => {
    let enteredPreview = 0;
    let startedPlayback = 0;
    let scheduledDelay = 0;
    let scheduled: (() => void) | null = null;
    let cancelled = false;

    beginVideoPresentation(
      {
        enterPreview: () => enteredPreview++,
        startPlayback: () => startedPlayback++,
      },
      VIDEO_START_DELAY_MS,
      (callback, delayMs) => {
        scheduled = callback;
        scheduledDelay = delayMs;
        return () => {
          cancelled = true;
        };
      }
    );

    expect(enteredPreview).toBe(1);
    expect(startedPlayback).toBe(0);
    expect(scheduledDelay).toBe(VIDEO_START_DELAY_MS);
    expect(VIDEO_START_DELAY_MS).toBe(3_000);

    const runScheduled = scheduled as (() => void) | null;
    runScheduled?.();
    expect(startedPlayback).toBe(1);

    cancelPendingVideoPresentation();
    expect(cancelled).toBe(false);
  });

  test("cancels a pending launch when presentation is exited", () => {
    let cancelled = false;
    beginVideoPresentation(
      { enterPreview: () => {}, startPlayback: () => {} },
      VIDEO_START_DELAY_MS,
      () => () => {
        cancelled = true;
      }
    );

    cancelPendingVideoPresentation();
    expect(cancelled).toBe(true);
  });

  test("uses the configured start delay", () => {
    let scheduledDelay = 0;
    beginVideoPresentation(
      { enterPreview: () => {}, startPlayback: () => {} },
      8_500,
      (_callback, delayMs) => {
        scheduledDelay = delayMs;
        return () => {};
      }
    );

    expect(scheduledDelay).toBe(8_500);
    cancelPendingVideoPresentation();
  });
});
