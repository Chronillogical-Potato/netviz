import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  prefersReducedMotion,
  scenarioRuntime,
} from "@/animation/runtime-instance";
import type { TransportSnapshot } from "@/animation/runtime";
import { cn } from "@/lib/utils";
import {
  useFlowStore,
  type MotionPreference,
  type WorkMode,
} from "@/store/flow-store";
import { Button } from "@/ui/button";
import { Slider } from "@/ui/slider";

export type PlaybackShortcut = "toggle-playback" | "restart";

const INTERACTIVE_SELECTOR =
  "input, select, textarea, button, [contenteditable='true']";

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") return false;

  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  };
  const tagName = element.tagName?.toLowerCase();
  if (
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    tagName === "button" ||
    element.isContentEditable
  ) {
    return true;
  }

  return element.closest?.(INTERACTIVE_SELECTOR) != null;
}

export function resolvePlaybackShortcut(
  event: KeyboardEvent,
  workMode: WorkMode
): PlaybackShortcut | null {
  if (workMode !== "animation" && workMode !== "preview") return null;
  if (
    event.repeat ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    isInteractiveTarget(event.target)
  ) {
    return null;
  }

  if (
    event.code === "Space" ||
    event.key === " " ||
    event.key === "Spacebar"
  ) {
    return "toggle-playback";
  }
  if (event.key === "Home") return "restart";
  return null;
}

function useTransportSnapshot(): TransportSnapshot {
  const snapshotRef = useRef<TransportSnapshot>(
    scenarioRuntime.getTransportSnapshot()
  );
  const subscribe = useCallback((onStoreChange: () => void) => {
    return scenarioRuntime.subscribeTransport((snapshot) => {
      snapshotRef.current = snapshot;
      onStoreChange();
    });
  }, []);
  const getSnapshot = useCallback(() => snapshotRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function formatTime(timeMs: number): string {
  const safeTimeMs = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
  const totalTenths = Math.round(safeTimeMs / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2];

export function PlaybackControls({
  className,
  motionPreference: motionPreferenceOverride,
}: {
  className?: string;
  motionPreference?: MotionPreference;
}) {
  const workMode = useFlowStore((state) => state.workMode);
  const storedMotionPreference = useFlowStore(
    (state) => state.motionPreference
  );
  const setMotionPreference = useFlowStore(
    (state) => state.setMotionPreference
  );
  const motionPreference =
    motionPreferenceOverride ?? storedMotionPreference;
  const motionBlocked = prefersReducedMotion(motionPreference);
  const transport = useTransportSnapshot();
  const hasScenario =
    transport.scenarioId !== null && transport.durationMs > 0;
  const currentTime = formatTime(transport.currentTimeMs);
  const duration = formatTime(transport.durationMs);
  const playbackRates = PLAYBACK_RATES.includes(transport.playbackRate)
    ? PLAYBACK_RATES
    : [...PLAYBACK_RATES, transport.playbackRate].sort((left, right) =>
        left - right
      );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = resolvePlaybackShortcut(event, workMode);
      if (shortcut === null) return;
      if (motionBlocked) return;
      const currentTransport = scenarioRuntime.getTransportSnapshot();
      if (
        currentTransport.scenarioId === null ||
        currentTransport.durationMs <= 0
      ) {
        return;
      }

      event.preventDefault();
      if (shortcut === "restart") {
        scenarioRuntime.restart();
        return;
      }

      if (currentTransport.isPlaying) {
        scenarioRuntime.pause();
      } else {
        scenarioRuntime.play();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [motionBlocked, workMode]);

  if (motionBlocked) {
    return (
      <div
        role="toolbar"
        aria-label="Animation playback"
        className={cn(
          "flex h-9 min-w-0 items-center gap-2 rounded-xl border border-border/60 bg-popover/95 px-2 shadow-lg backdrop-blur",
          className
        )}
      >
        <span className="text-[11px] text-muted-foreground">
          Reduced motion is on
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          aria-label="Enable full motion"
          onClick={() => setMotionPreference("full")}
        >
          Enable motion
        </Button>
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Animation playback"
      className={cn(
        "flex h-9 min-w-0 items-center gap-1 rounded-xl border border-border/60 bg-popover/95 p-1 shadow-lg backdrop-blur",
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-lg"
        aria-label={transport.isPlaying ? "Pause animation" : "Play animation"}
        aria-keyshortcuts="Space"
        disabled={!hasScenario}
        onClick={() =>
          transport.isPlaying
            ? scenarioRuntime.pause()
            : scenarioRuntime.play()
        }
      >
        <span aria-hidden="true" className="text-[11px] leading-none">
          {transport.isPlaying ? "Ⅱ" : "▶"}
        </span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-lg text-base"
        aria-label="Restart animation"
        aria-keyshortcuts="Home"
        disabled={!hasScenario}
        onClick={() => scenarioRuntime.restart()}
      >
        <span aria-hidden="true">↺</span>
      </Button>

      <Slider
        min={0}
        max={transport.durationMs}
        step={10}
        value={transport.currentTimeMs}
        disabled={!hasScenario}
        aria-label="Playback position"
        aria-valuetext={`${currentTime} of ${duration}`}
        className="mx-1 w-28 min-w-16 sm:w-40"
        onChange={(event) =>
          scenarioRuntime.seek(Number(event.currentTarget.value))
        }
      />
      <output
        aria-live="off"
        className="hidden min-w-[6.75rem] shrink-0 text-center text-[10px] tabular-nums text-muted-foreground sm:block"
      >
        {currentTime} / {duration}
      </output>

      <select
        aria-label="Playback rate"
        value={transport.playbackRate}
        disabled={!hasScenario}
        onChange={(event) =>
          scenarioRuntime.setPlaybackRate(Number(event.currentTarget.value))
        }
        className="h-7 w-[3.6rem] shrink-0 rounded-lg border-0 bg-muted px-1 text-center text-[11px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {playbackRates.map((rate) => (
          <option key={rate} value={rate}>
            {rate}×
          </option>
        ))}
      </select>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1 rounded-lg px-2 text-[11px]"
        aria-label="Reverse playback"
        aria-pressed={transport.direction === "reverse"}
        disabled={!hasScenario}
        onClick={() =>
          scenarioRuntime.setDirection(
            transport.direction === "forward" ? "reverse" : "forward"
          )
        }
      >
        <span aria-hidden="true">
          {transport.direction === "forward" ? "→" : "←"}
        </span>
        <span className="hidden md:inline">
          {transport.direction === "forward" ? "Forward" : "Reverse"}
        </span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 rounded-lg px-2 text-[11px]"
        aria-label="Loop playback"
        aria-pressed={transport.loop}
        disabled={!hasScenario}
        onClick={() => scenarioRuntime.setLoop(!transport.loop)}
      >
        Loop
      </Button>
    </div>
  );
}
