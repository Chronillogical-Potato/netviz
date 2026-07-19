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
import {
  applyNodeBorderEntrySides,
  normalizeGradientBeamDefaults,
} from "@/animation/gradient-beam";
import {
  buildSequentialCustomPathScenario,
  PLAY_ALL_CUSTOM_PATHS_SCENARIO_ID,
} from "@/animation/custom-path";
import { cn } from "@/lib/utils";
import {
  useFlowStore,
  type MotionPreference,
  type WorkMode,
} from "@/store/flow-store";
import { Button } from "@/ui/button";
import { Pause, Play, Restart } from "@/ui/icons";

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

const PLAYBACK_RATES = [0.5, 1, 1.5, 2];

function prepareAllConnections() {
  const state = useFlowStore.getState();
  const scenarioDocument = applyNodeBorderEntrySides(
    normalizeGradientBeamDefaults(state.scenarioDocument),
    state.edges
  );
  if (scenarioDocument !== state.scenarioDocument) {
    useFlowStore.setState({ scenarioDocument });
  }
  const sequence = buildSequentialCustomPathScenario(
    scenarioDocument,
    state.edges
  );
  if (
    sequence &&
    scenarioRuntime.getTransportSnapshot().scenarioId !==
      PLAY_ALL_CUSTOM_PATHS_SCENARIO_ID
  ) {
    scenarioRuntime.activate(state.activePageId, sequence);
  }
  scenarioRuntime.setTargetScope(null);
  scenarioRuntime.setLoop(true);
}

function playAllConnections() {
  prepareAllConnections();
  scenarioRuntime.play();
}

function restartAllConnections() {
  prepareAllConnections();
  scenarioRuntime.restart();
}

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
        restartAllConnections();
        return;
      }

      if (currentTransport.isPlaying) {
        scenarioRuntime.pause();
      } else {
        playAllConnections();
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
          "flex min-w-0 flex-col gap-2 border-b border-border px-4 py-3.5",
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
        "flex min-w-0 flex-col gap-2 border-b border-border px-4 py-3.5",
        className
      )}
    >
      <div className="flex items-center">
        <span className="text-xs font-semibold text-foreground">Player</span>
      </div>
      <div className="flex gap-1 rounded-lg bg-input p-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 flex-1 gap-1.5 rounded-md text-xs"
          aria-label={transport.isPlaying ? "Pause animation" : "Play animation"}
          aria-keyshortcuts="Space"
          disabled={!hasScenario}
          onClick={() =>
            transport.isPlaying ? scenarioRuntime.pause() : playAllConnections()
          }
        >
          {transport.isPlaying ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {transport.isPlaying ? "Pause" : "Play all"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md"
          aria-label="Restart animation"
          aria-keyshortcuts="Home"
          disabled={!hasScenario}
          onClick={restartAllConnections}
        >
          <Restart className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid min-h-7 grid-cols-[72px_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">Speed</span>
        <div
          role="group"
          aria-label="Playback speed"
          className="grid grid-cols-4 rounded-md bg-input p-0.5"
        >
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              aria-label={`Playback rate ${rate}x`}
              aria-pressed={transport.playbackRate === rate}
              disabled={!hasScenario}
              onClick={() => scenarioRuntime.setPlaybackRate(rate)}
              className={cn(
                "h-6 rounded text-[11px] font-medium text-muted-foreground transition-colors disabled:opacity-45",
                transport.playbackRate === rate &&
                  "bg-muted text-foreground shadow-sm"
              )}
            >
              {rate}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
