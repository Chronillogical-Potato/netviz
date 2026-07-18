export type TransportDirection = "forward" | "reverse";

export interface AnimationFrameScheduler {
  now(): number;
  requestFrame(callback: (timestampMs: number) => void): number;
  cancelFrame(id: number): void;
}

export interface ClockLoopRegion {
  enabled: boolean;
  startMs: number;
  endMs: number;
}

export interface ScenarioClockOptions {
  durationMs?: number;
  playbackRate?: number;
  direction?: TransportDirection;
  loop?: boolean | ClockLoopRegion;
}

export interface ClockSnapshot {
  currentTimeMs: number;
  durationMs: number;
  playbackRate: number;
  direction: TransportDirection;
  loop: boolean;
  loopRegion: ClockLoopRegion;
  isPlaying: boolean;
}

type ClockListener = (snapshot: ClockSnapshot) => void;

const browserScheduler: AnimationFrameScheduler = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const modulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

export class ScenarioClock {
  private readonly listeners = new Set<ClockListener>();
  private frameId: number | null = null;
  private destroyed = false;
  private currentTimeMs = 0;
  private durationMs: number;
  private playbackRate: number;
  private direction: TransportDirection;
  private loopRegion: ClockLoopRegion;
  private isPlaying = false;
  private timelineAnchorMs = 0;
  private monotonicAnchorMs = 0;

  constructor(
    private readonly scheduler: AnimationFrameScheduler = browserScheduler,
    options: ScenarioClockOptions = {}
  ) {
    this.durationMs = Math.max(0, finiteOr(options.durationMs ?? 0, 0));
    this.playbackRate = this.normalizeRate(options.playbackRate ?? 1);
    this.direction = options.direction ?? "forward";
    this.loopRegion = this.normalizeLoop(options.loop ?? false);
    this.reanchor(this.scheduler.now());
  }

  getSnapshot = (): ClockSnapshot => ({
    currentTimeMs: this.currentTimeMs,
    durationMs: this.durationMs,
    playbackRate: this.playbackRate,
    direction: this.direction,
    loop: this.loopRegion.enabled,
    loopRegion: { ...this.loopRegion },
    isPlaying: this.isPlaying,
  });

  subscribe = (listener: ClockListener) => {
    this.assertAlive();
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  };

  configure = (options: ScenarioClockOptions) => {
    this.assertAlive();
    this.cancelScheduledFrame();
    this.isPlaying = false;
    this.durationMs = Math.max(0, finiteOr(options.durationMs ?? 0, 0));
    this.playbackRate = this.normalizeRate(options.playbackRate ?? 1);
    this.direction = options.direction ?? "forward";
    this.loopRegion = this.normalizeLoop(options.loop ?? false);
    this.currentTimeMs = 0;
    this.reanchor(this.scheduler.now());
    this.emit();
  };

  play = () => {
    this.assertAlive();
    if (this.isPlaying || this.durationMs <= 0) return;

    if (this.direction === "forward" && this.currentTimeMs >= this.durationMs) {
      this.currentTimeMs = this.loopRegion.enabled
        ? this.loopRegion.startMs
        : 0;
    } else if (this.direction === "reverse" && this.currentTimeMs <= 0) {
      this.currentTimeMs = this.loopRegion.enabled
        ? this.loopRegion.endMs
        : this.durationMs;
    }

    this.isPlaying = true;
    this.reanchor(this.scheduler.now());
    this.emit();
    this.scheduleFrame();
  };

  pause = () => {
    this.assertAlive();
    if (!this.isPlaying) return;
    this.sample(this.scheduler.now());
    this.isPlaying = false;
    this.cancelScheduledFrame();
    this.reanchor(this.scheduler.now());
    this.emit();
  };

  restart = () => {
    this.assertAlive();
    this.currentTimeMs =
      this.direction === "reverse"
        ? this.loopRegion.enabled
          ? this.loopRegion.endMs
          : this.durationMs
        : this.loopRegion.enabled
          ? this.loopRegion.startMs
          : 0;
    this.reanchor(this.scheduler.now());
    this.emit();
    if (this.isPlaying) this.scheduleFrame();
  };

  stop = () => {
    this.assertAlive();
    this.cancelScheduledFrame();
    this.isPlaying = false;
    this.currentTimeMs = 0;
    this.reanchor(this.scheduler.now());
    this.emit();
  };

  seek = (timeMs: number) => {
    this.assertAlive();
    this.currentTimeMs = clamp(
      finiteOr(timeMs, 0),
      0,
      this.durationMs
    );
    this.reanchor(this.scheduler.now());
    this.emit();
  };

  setPlaybackRate = (rate: number) => {
    this.assertAlive();
    if (this.isPlaying) this.sample(this.scheduler.now());
    this.playbackRate = this.normalizeRate(rate);
    this.reanchor(this.scheduler.now());
    this.emit();
  };

  setDirection = (direction: TransportDirection) => {
    this.assertAlive();
    if (this.isPlaying) this.sample(this.scheduler.now());
    this.direction = direction;
    this.reanchor(this.scheduler.now());
    this.emit();
  };

  setLoop = (loop: boolean | ClockLoopRegion) => {
    this.assertAlive();
    if (this.isPlaying) this.sample(this.scheduler.now());
    this.loopRegion = this.normalizeLoop(loop);
    this.reanchor(this.scheduler.now());
    this.emit();
  };

  destroy = () => {
    if (this.destroyed) return;
    this.cancelScheduledFrame();
    this.isPlaying = false;
    this.destroyed = true;
    this.listeners.clear();
  };

  private normalizeRate(rate: number) {
    const normalized = finiteOr(rate, 1);
    return normalized > 0 ? normalized : 1;
  }

  private normalizeLoop(loop: boolean | ClockLoopRegion): ClockLoopRegion {
    const requested =
      typeof loop === "boolean"
        ? { enabled: loop, startMs: 0, endMs: this.durationMs }
        : loop;
    const startMs = clamp(finiteOr(requested.startMs, 0), 0, this.durationMs);
    const endMs = clamp(
      finiteOr(requested.endMs, this.durationMs),
      startMs,
      this.durationMs
    );
    const valid = endMs > startMs;
    return {
      enabled: requested.enabled && valid,
      startMs: valid ? startMs : 0,
      endMs: valid ? endMs : this.durationMs,
    };
  }

  private sample(timestampMs: number) {
    if (!this.isPlaying) return;
    const direction = this.direction === "forward" ? 1 : -1;
    const projected =
      this.timelineAnchorMs +
      (timestampMs - this.monotonicAnchorMs) * this.playbackRate * direction;

    if (this.loopRegion.enabled) {
      const { startMs, endMs } = this.loopRegion;
      const rangeMs = endMs - startMs;
      this.currentTimeMs = startMs + modulo(projected - startMs, rangeMs);
      return;
    }

    if (this.direction === "forward" && projected >= this.durationMs) {
      this.currentTimeMs = this.durationMs;
      this.isPlaying = false;
      return;
    }
    if (this.direction === "reverse" && projected <= 0) {
      this.currentTimeMs = 0;
      this.isPlaying = false;
      return;
    }
    this.currentTimeMs = clamp(projected, 0, this.durationMs);
  }

  private reanchor(timestampMs: number) {
    this.timelineAnchorMs = this.currentTimeMs;
    this.monotonicAnchorMs = timestampMs;
  }

  private scheduleFrame() {
    if (!this.isPlaying || this.frameId !== null) return;
    this.frameId = this.scheduler.requestFrame(this.onFrame);
  }

  private cancelScheduledFrame() {
    if (this.frameId === null) return;
    this.scheduler.cancelFrame(this.frameId);
    this.frameId = null;
  }

  private onFrame = (timestampMs: number) => {
    this.frameId = null;
    if (!this.isPlaying || this.destroyed) return;
    this.sample(timestampMs);
    this.emit();
    this.scheduleFrame();
  };

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertAlive() {
    if (this.destroyed) throw new Error("ScenarioClock has been destroyed");
  }
}
