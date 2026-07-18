import type {
  ScenarioClipV1,
  ScenarioTrackV1,
  ScenarioV1,
} from "./model";
import {
  ScenarioClock,
  type AnimationFrameScheduler,
  type ClockSnapshot,
  type TransportDirection,
} from "./clock";
import { evaluateClipTiming, type ClipTimingResult } from "./timing";

export interface ActiveClipFrame {
  trackId: string;
  clip: ScenarioClipV1;
  timing: ClipTimingResult;
}

export interface TargetFrame {
  pageId: string | null;
  scenarioId: string | null;
  targetId: string;
  timeMs: number;
  clips: ActiveClipFrame[];
  clear: boolean;
}

export interface TransportSnapshot extends ClockSnapshot {
  pageId: string | null;
  scenarioId: string | null;
}

type TargetListener = (frame: TargetFrame) => void;
type TransportListener = (snapshot: TransportSnapshot) => void;

export class ScenarioRuntime {
  private static readonly TRANSPORT_FRAME_INTERVAL_MS = 50;
  private readonly clock: ScenarioClock;
  private readonly tracksByTarget = new Map<string, ScenarioTrackV1[]>();
  private readonly targetListeners = new Map<string, Set<TargetListener>>();
  private readonly transportListeners = new Set<TransportListener>();
  private readonly activeTargets = new Set<string>();
  private readonly unsubscribeClock: () => boolean;
  private pageId: string | null = null;
  private scenario: ScenarioV1 | null = null;
  private projectionEnabled = false;
  private destroyed = false;
  private clockSnapshot: ClockSnapshot;
  private lastTransportNotification: TransportSnapshot | null = null;
  private forceNextTransportNotification = false;

  constructor(scheduler?: AnimationFrameScheduler) {
    this.clock = new ScenarioClock(scheduler);
    this.clockSnapshot = this.clock.getSnapshot();
    this.unsubscribeClock = this.clock.subscribe(this.onClockUpdate);
  }

  getTransportSnapshot = (): TransportSnapshot => ({
    ...this.clockSnapshot,
    pageId: this.pageId,
    scenarioId: this.scenario?.id ?? null,
  });

  subscribeTransport = (listener: TransportListener) => {
    this.assertAlive();
    this.transportListeners.add(listener);
    const snapshot = this.getTransportSnapshot();
    listener(snapshot);
    this.lastTransportNotification = snapshot;
    return () => {
      this.transportListeners.delete(listener);
      if (this.transportListeners.size === 0) {
        this.lastTransportNotification = null;
      }
    };
  };

  subscribeTarget = (targetId: string, listener: TargetListener) => {
    this.assertAlive();
    const listeners = this.targetListeners.get(targetId) ?? new Set<TargetListener>();
    listeners.add(listener);
    this.targetListeners.set(targetId, listeners);

    const frame = this.createTargetFrame(targetId, this.clockSnapshot.currentTimeMs);
    if (this.projectionEnabled && frame.clips.length > 0) listener(frame);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.targetListeners.delete(targetId);
        this.activeTargets.delete(targetId);
      }
    };
  };

  activate = (pageId: string, scenario: ScenarioV1 | null) => {
    this.assertAlive();
    this.clearActiveTargets();
    this.pageId = pageId;
    this.scenario = scenario;
    this.projectionEnabled = false;
    this.forceNextTransportNotification = true;
    this.indexTracks(scenario);
    this.clock.configure(
      scenario
        ? {
            durationMs: scenario.durationMs,
            playbackRate: scenario.playback.rate,
            loop: {
              enabled: scenario.playback.loop.mode === "repeat",
              startMs: scenario.playback.loop.startMs,
              endMs: scenario.playback.loop.endMs,
            },
          }
        : { durationMs: 0 }
    );
  };

  reconcile = (pageId: string, scenario: ScenarioV1 | null) => {
    this.assertAlive();
    if (
      pageId !== this.pageId ||
      scenario?.id !== this.scenario?.id ||
      scenario === null
    ) {
      this.activate(pageId, scenario);
      return;
    }

    const previous = this.clockSnapshot;
    const projectionEnabled = this.projectionEnabled;
    this.clearActiveTargets();
    this.projectionEnabled = false;
    this.scenario = scenario;
    this.indexTracks(scenario);
    this.forceNextTransportNotification = true;
    this.clock.configure({
      durationMs: scenario.durationMs,
      playbackRate: scenario.playback.rate,
      loop: {
        enabled: scenario.playback.loop.mode === "repeat",
        startMs: scenario.playback.loop.startMs,
        endMs: scenario.playback.loop.endMs,
      },
    });
    this.clock.setPlaybackRate(previous.playbackRate);
    this.clock.setDirection(previous.direction);
    this.clock.setLoop(
      previous.loop
        ? {
            enabled: true,
            startMs: scenario.playback.loop.startMs,
            endMs: scenario.playback.loop.endMs,
          }
        : false
    );
    const currentTimeMs = Math.min(previous.currentTimeMs, scenario.durationMs);
    this.clock.seek(currentTimeMs);
    this.projectionEnabled = projectionEnabled;
    if (previous.isPlaying) {
      this.clock.play();
    } else if (projectionEnabled) {
      this.clock.seek(currentTimeMs);
    }
  };

  play = () => {
    this.assertAlive();
    if (!this.scenario) return;
    this.projectionEnabled = true;
    this.forceNextTransportNotification = true;
    this.clock.play();
  };

  pause = () => {
    this.assertAlive();
    this.forceNextTransportNotification = true;
    this.clock.pause();
  };

  restart = () => {
    this.assertAlive();
    if (!this.scenario) return;
    this.projectionEnabled = true;
    this.forceNextTransportNotification = true;
    this.clock.restart();
  };

  seek = (timeMs: number) => {
    this.assertAlive();
    if (!this.scenario) return;
    this.projectionEnabled = true;
    this.forceNextTransportNotification = true;
    this.clock.seek(timeMs);
  };

  setPlaybackRate = (rate: number) => {
    this.assertAlive();
    this.forceNextTransportNotification = true;
    this.clock.setPlaybackRate(rate);
  };

  setDirection = (direction: TransportDirection) => {
    this.assertAlive();
    this.forceNextTransportNotification = true;
    this.clock.setDirection(direction);
  };

  setLoop = (enabled: boolean) => {
    this.assertAlive();
    this.forceNextTransportNotification = true;
    const authoredLoop = this.scenario?.playback.loop;
    this.clock.setLoop(
      enabled
        ? {
            enabled: true,
            startMs:
              authoredLoop?.mode === "repeat" ? authoredLoop.startMs : 0,
            endMs:
              authoredLoop?.mode === "repeat"
                ? authoredLoop.endMs
                : this.clockSnapshot.durationMs,
          }
        : false
    );
  };

  /** Stops playback, clears all runtime projections, and resets to time zero. */
  stop = () => {
    this.assertAlive();
    this.projectionEnabled = false;
    this.forceNextTransportNotification = true;
    this.clock.stop();
  };

  destroy = () => {
    if (this.destroyed) return;
    this.projectionEnabled = false;
    this.clearActiveTargets();
    this.unsubscribeClock();
    this.clock.destroy();
    this.targetListeners.clear();
    this.transportListeners.clear();
    this.tracksByTarget.clear();
    this.destroyed = true;
  };

  private onClockUpdate = (snapshot: ClockSnapshot) => {
    const previous = this.clockSnapshot;
    this.clockSnapshot = snapshot;
    const controlsChanged =
      previous.isPlaying !== snapshot.isPlaying ||
      previous.durationMs !== snapshot.durationMs ||
      previous.playbackRate !== snapshot.playbackRate ||
      previous.direction !== snapshot.direction ||
      previous.loop !== snapshot.loop ||
      previous.loopRegion.startMs !== snapshot.loopRegion.startMs ||
      previous.loopRegion.endMs !== snapshot.loopRegion.endMs;
    this.notifyTransport(
      controlsChanged || this.forceNextTransportNotification
    );
    this.forceNextTransportNotification = false;
    this.evaluateTargets(snapshot.currentTimeMs);
  };

  private notifyTransport(force: boolean) {
    if (this.transportListeners.size === 0) return;
    const snapshot = this.getTransportSnapshot();
    const previous = this.lastTransportNotification;
    if (
      !force &&
      previous !== null &&
      Math.abs(snapshot.currentTimeMs - previous.currentTimeMs) <
        ScenarioRuntime.TRANSPORT_FRAME_INTERVAL_MS
    ) {
      return;
    }
    this.lastTransportNotification = snapshot;
    for (const listener of this.transportListeners) listener(snapshot);
  }

  private evaluateTargets(timeMs: number) {
    if (!this.projectionEnabled || !this.scenario) {
      this.clearActiveTargets();
      return;
    }

    const nextActiveTargets = new Set<string>();
    for (const targetId of this.targetListeners.keys()) {
      const frame = this.createTargetFrame(targetId, timeMs);
      if (frame.clips.length === 0) continue;
      nextActiveTargets.add(targetId);
      this.notifyTarget(targetId, frame);
    }

    for (const targetId of this.activeTargets) {
      if (!nextActiveTargets.has(targetId)) this.notifyClear(targetId, timeMs);
    }

    this.activeTargets.clear();
    for (const targetId of nextActiveTargets) this.activeTargets.add(targetId);
  }

  private createTargetFrame(targetId: string, timeMs: number): TargetFrame {
    const clips: ActiveClipFrame[] = [];
    for (const track of this.tracksByTarget.get(targetId) ?? []) {
      for (const clip of track.clips) {
        const timing = evaluateClipTiming(clip, timeMs);
        if (timing.active) clips.push({ trackId: track.id, clip, timing });
      }
    }
    return {
      pageId: this.pageId,
      scenarioId: this.scenario?.id ?? null,
      targetId,
      timeMs,
      clips,
      clear: false,
    };
  }

  private indexTracks(scenario: ScenarioV1 | null) {
    this.tracksByTarget.clear();
    if (!scenario) return;
    for (const track of scenario.tracks) {
      if (
        !track.enabled ||
        track.property !== "connection-effect" ||
        track.target.type !== "edge" ||
        !("id" in track.target)
      ) {
        continue;
      }
      const tracks = this.tracksByTarget.get(track.target.id) ?? [];
      tracks.push(track);
      this.tracksByTarget.set(track.target.id, tracks);
    }
  }

  private clearActiveTargets() {
    for (const targetId of this.activeTargets) {
      this.notifyClear(targetId, this.clockSnapshot.currentTimeMs);
    }
    this.activeTargets.clear();
  }

  private notifyClear(targetId: string, timeMs: number) {
    this.notifyTarget(targetId, {
      pageId: this.pageId,
      scenarioId: this.scenario?.id ?? null,
      targetId,
      timeMs,
      clips: [],
      clear: true,
    });
  }

  private notifyTarget(targetId: string, frame: TargetFrame) {
    for (const listener of this.targetListeners.get(targetId) ?? []) listener(frame);
  }

  private assertAlive() {
    if (this.destroyed) throw new Error("ScenarioRuntime has been destroyed");
  }
}
