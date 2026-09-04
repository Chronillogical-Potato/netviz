import { describe, expect, test } from "vitest";
import {
  ScenarioClock,
  type AnimationFrameScheduler,
} from "../src/animation/clock";

class ManualScheduler implements AnimationFrameScheduler {
  nowMs = 0;
  requestCount = 0;
  cancelCount = 0;
  private nextId = 1;
  private callbacks = new Map<number, (timestampMs: number) => void>();

  now = () => this.nowMs;

  requestFrame = (callback: (timestampMs: number) => void) => {
    const id = this.nextId++;
    this.requestCount += 1;
    this.callbacks.set(id, callback);
    return id;
  };

  cancelFrame = (id: number) => {
    if (this.callbacks.delete(id)) this.cancelCount += 1;
  };

  get pendingFrames() {
    return this.callbacks.size;
  }

  advanceWithoutFrame(ms: number) {
    this.nowMs += ms;
  }

  frame(ms: number) {
    this.nowMs += ms;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(this.nowMs);
  }
}

const createClock = (scheduler: ManualScheduler, durationMs = 1_000) =>
  new ScenarioClock(scheduler, { durationMs });

describe("scenario clock", () => {
  test("keeps exactly one frame scheduled while playing", () => {
    const scheduler = new ManualScheduler();
    const clock = createClock(scheduler);

    clock.play();
    clock.play();
    expect(scheduler.pendingFrames).toBe(1);

    scheduler.frame(16);
    expect(clock.getSnapshot().currentTimeMs).toBe(16);
    expect(scheduler.pendingFrames).toBe(1);

    clock.pause();
    expect(scheduler.pendingFrames).toBe(0);
  });

  test("uses anchor elapsed time so sparse and dense frames reach the same time", () => {
    const sparseScheduler = new ManualScheduler();
    const denseScheduler = new ManualScheduler();
    const sparse = createClock(sparseScheduler, 5_000);
    const dense = createClock(denseScheduler, 5_000);

    sparse.play();
    dense.play();
    sparseScheduler.frame(1_000);
    for (let index = 0; index < 10; index += 1) denseScheduler.frame(100);

    expect(sparse.getSnapshot().currentTimeMs).toBe(1_000);
    expect(dense.getSnapshot().currentTimeMs).toBe(1_000);
  });

  test("pause and resume exclude wall time spent paused", () => {
    const scheduler = new ManualScheduler();
    const clock = createClock(scheduler);

    clock.play();
    scheduler.frame(100);
    clock.pause();
    scheduler.advanceWithoutFrame(800);
    clock.play();
    scheduler.frame(100);

    expect(clock.getSnapshot().currentTimeMs).toBe(200);
  });

  test("reanchors seek, playback rate, and transport direction changes", () => {
    const scheduler = new ManualScheduler();
    const clock = createClock(scheduler);

    clock.seek(400);
    clock.setPlaybackRate(2);
    clock.play();
    scheduler.frame(100);
    expect(clock.getSnapshot().currentTimeMs).toBe(600);

    clock.setDirection("reverse");
    scheduler.frame(50);
    expect(clock.getSnapshot().currentTimeMs).toBe(500);
  });

  test("wraps missed frames through a loop region without accumulating deltas", () => {
    const scheduler = new ManualScheduler();
    const clock = createClock(scheduler);

    clock.setLoop({ enabled: true, startMs: 200, endMs: 800 });
    clock.seek(700);
    clock.play();
    scheduler.frame(500);

    expect(clock.getSnapshot().currentTimeMs).toBe(600);
    expect(clock.getSnapshot().isPlaying).toBe(true);
  });

  test("stops at either boundary when looping is disabled", () => {
    const forwardScheduler = new ManualScheduler();
    const reverseScheduler = new ManualScheduler();
    const forward = createClock(forwardScheduler);
    const reverse = createClock(reverseScheduler);

    forward.seek(900);
    forward.play();
    forwardScheduler.frame(200);
    expect(forward.getSnapshot()).toMatchObject({
      currentTimeMs: 1_000,
      isPlaying: false,
    });

    reverse.seek(100);
    reverse.setDirection("reverse");
    reverse.play();
    reverseScheduler.frame(200);
    expect(reverse.getSnapshot()).toMatchObject({
      currentTimeMs: 0,
      isPlaying: false,
    });
  });

  test("stop resets time and destroy cancels pending work", () => {
    const scheduler = new ManualScheduler();
    const clock = createClock(scheduler);

    clock.play();
    scheduler.frame(100);
    clock.stop();
    expect(clock.getSnapshot()).toMatchObject({
      currentTimeMs: 0,
      isPlaying: false,
    });

    clock.play();
    clock.destroy();
    expect(scheduler.pendingFrames).toBe(0);
    expect(() => clock.play()).toThrow("destroyed");
  });
});

export { ManualScheduler };
