import { describe, expect, test } from "vitest";
import type { ScenarioClipV1, ScenarioV1 } from "../src/animation/model";
import type { AnimationFrameScheduler } from "../src/animation/clock";
import { ScenarioRuntime, type TargetFrame } from "../src/animation/runtime";

class ManualScheduler implements AnimationFrameScheduler {
  nowMs = 0;
  private nextId = 1;
  private callbacks = new Map<number, (timestampMs: number) => void>();

  now = () => this.nowMs;
  requestFrame = (callback: (timestampMs: number) => void) => {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  };
  cancelFrame = (id: number) => {
    this.callbacks.delete(id);
  };

  get pendingFrames() {
    return this.callbacks.size;
  }

  frame(ms: number) {
    this.nowMs += ms;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(this.nowMs);
  }
}

const effectClip = (
  id: string,
  startMs: number,
  durationMs: number
): ScenarioClipV1 => ({
  id,
  startMs,
  durationMs,
  easing: "linear",
  repeatCount: 0,
  repeatDelayMs: 0,
  effect: { type: "edge.gradient-beam", params: { direction: "forward" } },
});

const scenario = (): ScenarioV1 => ({
  id: "scenario-1",
  name: "Request flow",
  durationMs: 1_000,
  playback: {
    rate: 1,
    loop: { mode: "none", startMs: 0, endMs: 1_000 },
  },
  tracks: [
    {
      id: "track-a",
      target: { type: "edge", id: "edge-a" },
      property: "connection-effect",
      enabled: true,
      clips: [effectClip("clip-a", 0, 200)],
    },
    {
      id: "track-b",
      target: { type: "edge", id: "edge-b" },
      property: "connection-effect",
      enabled: true,
      clips: [effectClip("clip-b", 500, 300)],
    },
  ],
  markers: [],
  triggers: [],
});

describe("scenario runtime", () => {
  test("activates a page scenario without persisting transport state", () => {
    const runtime = new ScenarioRuntime(new ManualScheduler());

    runtime.activate("page-1", scenario());

    expect(runtime.getTransportSnapshot()).toMatchObject({
      pageId: "page-1",
      scenarioId: "scenario-1",
      currentTimeMs: 0,
      durationMs: 1_000,
      playbackRate: 1,
      isPlaying: false,
    });
    expect(runtime.getActiveScenarioName()).toBe("Request flow");
  });

  test("reports the current marked animation name", () => {
    const runtime = new ScenarioRuntime(new ManualScheduler());
    runtime.activate("page-1", {
      ...scenario(),
      markers: [
        { id: "first", name: "Inbound request", atMs: 0 },
        { id: "second", name: "Database response", atMs: 600 },
      ],
    });

    const activeAnimationName = (
      runtime as unknown as { getActiveAnimationName?: () => string | null }
    ).getActiveAnimationName;
    expect(typeof activeAnimationName).toBe("function");
    if (!activeAnimationName) return;

    expect(activeAnimationName()).toBe("Inbound request");
    runtime.seek(599);
    expect(activeAnimationName()).toBe("Inbound request");
    runtime.seek(600);
    expect(activeAnimationName()).toBe("Database response");

    runtime.activate("page-1", scenario());
    expect(activeAnimationName()).toBe("Request flow");
  });

  test("exposes the complete active scenario to timeline consumers", () => {
    const runtime = new ScenarioRuntime(new ManualScheduler());
    const activeScenario = scenario();
    runtime.activate("page-1", activeScenario);

    expect(runtime.getActiveScenario()).toBe(activeScenario);
    runtime.activate("page-1", null);
    expect(runtime.getActiveScenario()).toBeNull();
  });

  test("exposes active frames for camera-follow consumers", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);

    runtime.activate("page-1", scenario());
    runtime.play();
    scheduler.frame(100);

    expect(runtime.getActiveTargetFrames()).toMatchObject([
      {
        targetId: "edge-a",
        clips: [{ timing: { active: true, progress: 0.5 } }],
      },
    ]);
  });

  test("notifies only active targets and clears a target exactly once on exit", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);
    const framesA: Array<{ clear: boolean; clipCount: number }> = [];
    const framesB: Array<{ clear: boolean; clipCount: number }> = [];
    const framesUnused: Array<{ clear: boolean }> = [];

    runtime.activate("page-1", scenario());
    runtime.subscribeTarget("edge-a", (frame) =>
      framesA.push({ clear: frame.clear, clipCount: frame.clips.length })
    );
    runtime.subscribeTarget("edge-b", (frame) =>
      framesB.push({ clear: frame.clear, clipCount: frame.clips.length })
    );
    runtime.subscribeTarget("edge-unused", (frame) =>
      framesUnused.push({ clear: frame.clear })
    );

    runtime.play();
    scheduler.frame(100);
    expect(framesA.at(-1)).toEqual({ clear: false, clipCount: 1 });
    expect(framesB).toHaveLength(0);
    expect(framesUnused).toHaveLength(0);

    scheduler.frame(150);
    expect(framesA.at(-1)).toEqual({ clear: true, clipCount: 0 });
    expect(framesA.filter((frame) => frame.clear)).toHaveLength(1);

    scheduler.frame(100);
    expect(framesA.filter((frame) => frame.clear)).toHaveLength(1);

    scheduler.frame(200);
    expect(framesB.at(-1)).toEqual({ clear: false, clipCount: 1 });
  });

  test("projects authored node border tracks through the same runtime", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);
    const nodeClip = effectClip("node-clip", 0, 800);
    nodeClip.effect = { type: "node.border-beam", params: {} };
    const withNodeTrack: ScenarioV1 = {
      ...scenario(),
      tracks: [
        ...scenario().tracks,
        {
          id: "node-track",
          target: { type: "node", id: "node-a" },
          property: "node-effect",
          enabled: true,
          clips: [nodeClip],
        },
      ],
    };
    const frames: TargetFrame[] = [];

    runtime.activate("page-1", withNodeTrack);
    runtime.subscribeTarget("node-a", (frame) => frames.push(frame));
    runtime.play();
    scheduler.frame(100);

    expect(frames.at(-1)?.clips[0]?.clip.effect.type).toBe(
      "node.border-beam"
    );
  });

  test("exposes transport updates separately from target frames", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);
    const times: number[] = [];

    runtime.activate("page-1", scenario());
    const unsubscribe = runtime.subscribeTransport((snapshot) => {
      times.push(snapshot.currentTimeMs);
    });
    runtime.play();
    scheduler.frame(50);
    scheduler.frame(50);
    unsubscribe();
    scheduler.frame(50);

    // The second zero reports the immediate paused -> playing transport change.
    expect(times).toEqual([0, 0, 50, 100]);
  });

  test("throttles frame-time transport notifications but flushes controls", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);
    const states: Array<{ time: number; playing: boolean }> = [];

    runtime.activate("page-1", scenario());
    runtime.subscribeTransport((snapshot) => {
      states.push({ time: snapshot.currentTimeMs, playing: snapshot.isPlaying });
    });
    runtime.play();
    for (let index = 0; index < 5; index += 1) scheduler.frame(10);
    runtime.pause();
    runtime.seek(17);

    expect(states).toEqual([
      { time: 0, playing: false },
      { time: 0, playing: true },
      { time: 50, playing: true },
      { time: 50, playing: false },
      { time: 17, playing: false },
    ]);
  });

  test("does not evaluate authored targets without mounted subscribers", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);
    const unobservedClip = effectClip("unobserved", 0, 500);
    unobservedClip.effect.params = Object.defineProperty({}, "direction", {
      enumerable: true,
      get() {
        throw new Error("unobserved target was evaluated");
      },
    });
    const withUnobserved: ScenarioV1 = {
      ...scenario(),
      tracks: [
        ...scenario().tracks,
        {
          id: "unobserved-track",
          target: { type: "edge", id: "edge-unobserved" },
          property: "connection-effect",
          enabled: true,
          clips: [unobservedClip],
        },
      ],
    };

    runtime.activate("page-1", withUnobserved);
    runtime.subscribeTarget("edge-a", () => undefined);
    runtime.play();
    expect(() => scheduler.frame(50)).not.toThrow();
  });

  test("reconfigures clock controls through the runtime facade", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);

    runtime.activate("page-1", scenario());
    runtime.seek(400);
    runtime.setPlaybackRate(2);
    runtime.setDirection("reverse");
    runtime.setLoop(true);
    runtime.play();
    scheduler.frame(50);

    expect(runtime.getTransportSnapshot()).toMatchObject({
      currentTimeMs: 300,
      playbackRate: 2,
      direction: "reverse",
      loop: true,
    });
  });

  test("scopes selection previews without changing authored scenario targets", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);
    const framesA: string[] = [];
    const framesB: string[] = [];
    const overlapping = scenario();
    overlapping.tracks[1] = {
      ...overlapping.tracks[1],
      clips: [effectClip("clip-b", 0, 200)],
    };

    runtime.activate("page-1", overlapping);
    runtime.subscribeTarget("edge-a", (frame) => {
      if (!frame.clear) framesA.push(frame.targetId);
    });
    runtime.subscribeTarget("edge-b", (frame) => {
      if (!frame.clear) framesB.push(frame.targetId);
    });
    runtime.setTargetScope(["edge-a"]);
    runtime.play();
    scheduler.frame(50);

    expect(framesA).toEqual(["edge-a", "edge-a"]);
    expect(framesB).toEqual([]);
    expect(overlapping.tracks).toHaveLength(2);

    runtime.setTargetScope(null);
    expect(framesB).toEqual(["edge-b"]);
  });

  test("reconciles same-scenario edits without changing transport time or play state", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);
    const edited = scenario();
    edited.durationMs = 2_000;
    edited.playback.loop.endMs = 2_000;
    edited.tracks[0] = {
      ...edited.tracks[0],
      clips: [{ ...edited.tracks[0].clips[0], durationMs: 800 }],
    };

    runtime.activate("page-1", scenario());
    runtime.seek(400);
    runtime.play();
    scheduler.frame(50);
    runtime.reconcile("page-1", edited);

    expect(runtime.getTransportSnapshot()).toMatchObject({
      pageId: "page-1",
      scenarioId: "scenario-1",
      currentTimeMs: 450,
      durationMs: 2_000,
      isPlaying: true,
    });
  });

  test("stop resets transport and clears projection when leaving playback modes", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);
    const frames: Array<{ clear: boolean; timeMs: number }> = [];

    runtime.activate("page-1", scenario());
    runtime.subscribeTarget("edge-a", (frame) =>
      frames.push({ clear: frame.clear, timeMs: frame.timeMs })
    );
    runtime.play();
    scheduler.frame(50);
    runtime.stop();

    expect(runtime.getTransportSnapshot()).toMatchObject({
      currentTimeMs: 0,
      isPlaying: false,
    });
    expect(frames.at(-1)).toEqual({ clear: true, timeMs: 0 });
    expect(frames.filter((frame) => frame.clear)).toHaveLength(1);
  });

  test("activation and destroy clear active projections and cancel the frame", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);
    const clears: boolean[] = [];

    runtime.activate("page-1", scenario());
    runtime.subscribeTarget("edge-a", (frame) => clears.push(frame.clear));
    runtime.play();
    scheduler.frame(50);

    runtime.activate("page-2", null);
    expect(clears).toEqual([false, false, true]);
    expect(runtime.getTransportSnapshot()).toMatchObject({
      pageId: "page-2",
      scenarioId: null,
      currentTimeMs: 0,
      isPlaying: false,
    });

    runtime.activate("page-1", scenario());
    runtime.play();
    scheduler.frame(50);
    runtime.destroy();
    expect(clears.at(-1)).toBe(true);
    expect(scheduler.pendingFrames).toBe(0);
  });

  test("skips unsupported target types while retaining scenario data", () => {
    const scheduler = new ManualScheduler();
    const runtime = new ScenarioRuntime(scheduler);
    const cameraFrames: unknown[] = [];
    const withCamera: ScenarioV1 = {
      ...scenario(),
      tracks: [
        {
          id: "camera-track",
          target: { type: "camera", id: "page-camera" },
          property: "camera",
          enabled: true,
          clips: [effectClip("camera-clip", 0, 200)],
        },
      ],
    };

    runtime.activate("page-1", withCamera);
    runtime.subscribeTarget("page-camera", (frame) => cameraFrames.push(frame));
    runtime.play();
    scheduler.frame(50);

    expect(cameraFrames).toHaveLength(0);
  });
});
