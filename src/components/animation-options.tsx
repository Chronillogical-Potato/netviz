import { useMemo } from "react";
import type {
  AnimationDirectionV1,
  EdgeEffectPreset,
  FieldState,
  JsonObject,
  PageScenarioDocumentV1,
} from "@/animation/model";
import {
  summarizeEdgeEffectField,
  type ScenarioClipPatchV1,
} from "@/animation/scenario-document";
import {
  prefersReducedMotion,
  scenarioRuntime,
} from "@/animation/runtime-instance";
import { useFlowStore } from "@/store/flow-store";
import { Button } from "@/ui/button";
import { cn } from "@/lib/utils";

const PRESETS: Array<{
  type: EdgeEffectPreset;
  label: string;
  params: JsonObject;
}> = [
  {
    type: "edge.moving-dash",
    label: "Moving dash",
    params: {
      direction: "forward",
      color: "#38bdf8",
      widthPx: 2,
      opacity: 1,
      dashLengthPx: 8,
      gapLengthPx: 6,
    },
  },
  {
    type: "edge.gradient-beam",
    label: "Gradient beam",
    params: {
      direction: "forward",
      colors: ["#38bdf8", "#818cf8"],
      widthPx: 3,
      opacity: 1,
      trailLength: 0.24,
      glowBlurPx: 6,
    },
  },
  {
    type: "edge.packet",
    label: "Packet",
    params: {
      direction: "forward",
      color: "#38bdf8",
      widthPx: 3,
      opacity: 1,
      sizePx: 6,
      packetLength: 0.025,
    },
  },
  {
    type: "edge.pulse",
    label: "Pulse",
    params: {
      direction: "forward",
      color: "#38bdf8",
      widthPx: 4,
      opacity: 1,
      trailLength: 0.18,
      glowBlurPx: 8,
    },
  },
  {
    type: "edge.particle-stream",
    label: "Particle stream",
    params: {
      direction: "forward",
      color: "#38bdf8",
      widthPx: 2,
      opacity: 1,
      particleCount: 8,
      particleSizePx: 3,
    },
  },
];

const DIRECTIONS: Array<{ value: AnimationDirectionV1; label: string }> = [
  { value: "forward", label: "Forward" },
  { value: "reverse", label: "Reverse" },
  { value: "bidirectional", label: "Bidirectional" },
  { value: "ping-pong", label: "Ping-pong" },
];

const selectClass =
  "h-8 w-full rounded-lg border border-border bg-input px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-45";
const inputClass =
  "h-8 w-full rounded-lg border border-border bg-input px-2 text-xs tabular-nums text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-45";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-h-8 grid-cols-[78px_1fr] items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function numericValue(
  state: FieldState<number | undefined>,
  scale = 1
) {
  return state.status === "uniform" && typeof state.value === "number"
    ? state.value / scale
    : "";
}

export function createAnimationColorPatch(
  color: string
): ScenarioClipPatchV1 {
  return { effect: { params: { color } } };
}

export function createAnimationWidthPatch(
  value: number
): ScenarioClipPatchV1 {
  const width = Math.min(24, Math.max(0.5, value));
  return {
    effect: {
      params: {
        widthPx: width,
        sizePx: width,
        particleSizePx: width,
      },
    },
  };
}

export function summarizeAnimationSelection(
  document: PageScenarioDocumentV1,
  selectedEdgeIds: readonly string[]
) {
  const preset = summarizeEdgeEffectField(
    document,
    selectedEdgeIds,
    (clip) => clip.effect.type
  );
  const direction = summarizeEdgeEffectField(
    document,
    selectedEdgeIds,
    (clip) => {
      const value = clip.effect.params.direction;
      return typeof value === "string" ? value : undefined;
    }
  );
  return {
    preset,
    direction,
    duration: summarizeEdgeEffectField(document, selectedEdgeIds, (clip) =>
      clip.durationMs
    ),
    delay: summarizeEdgeEffectField(document, selectedEdgeIds, (clip) =>
      clip.startMs
    ),
    color: summarizeEdgeEffectField(document, selectedEdgeIds, (clip) => {
      const color = clip.effect.params.color;
      const colors = clip.effect.params.colors;
      if (typeof color === "string") return color;
      return Array.isArray(colors) && typeof colors[0] === "string"
        ? colors[0]
        : undefined;
    }),
    width: summarizeEdgeEffectField(document, selectedEdgeIds, (clip) => {
      const keys =
        clip.effect.type === "edge.packet"
          ? ["sizePx", "packetSizePx", "widthPx"]
          : clip.effect.type === "edge.particle-stream"
            ? ["particleSizePx", "particleSize", "widthPx"]
            : ["widthPx"];
      for (const key of keys) {
        const value = clip.effect.params[key];
        if (typeof value === "number") return value;
      }
      return undefined;
    }),
    opacity: summarizeEdgeEffectField(document, selectedEdgeIds, (clip) => {
      const value = clip.effect.params.opacity;
      return typeof value === "number" ? value : undefined;
    }),
    glow: summarizeEdgeEffectField(document, selectedEdgeIds, (clip) => {
      const value = clip.effect.params.glowBlurPx;
      return typeof value === "number" ? value : undefined;
    }),
  };
}

export function AnimationOptions() {
  const edges = useFlowStore((state) => state.edges);
  const selectedEdgeIds = useMemo(
    () => edges.filter((edge) => edge.selected).map((edge) => edge.id),
    [edges]
  );
  const document = useFlowStore((state) => state.scenarioDocument);
  const motionPreference = useFlowStore((state) => state.motionPreference);
  const applyEffect = useFlowStore((state) => state.applySelectedEdgeEffect);
  const patchEffects = useFlowStore((state) => state.patchSelectedEdgeEffects);
  const removeEffects = useFlowStore((state) => state.removeSelectedEdgeEffects);

  const summary = useMemo(
    () => summarizeAnimationSelection(document, selectedEdgeIds),
    [document, selectedEdgeIds]
  );

  let presetValue: string;
  if (summary.preset.status === "none") {
    presetValue = "none";
  } else if (summary.preset.status === "mixed") {
    presetValue = "mixed";
  } else {
    const value = summary.preset.value;
    presetValue = PRESETS.some((preset) => preset.type === value)
      ? value
      : "unsupported";
  }
  const hasEffect = summary.preset.status !== "none";
  const reduced = prefersReducedMotion(motionPreference);

  const previewSelection = () => {
    if (selectedEdgeIds.length === 0 || !hasEffect || reduced) return;
    scenarioRuntime.setTargetScope(selectedEdgeIds);
    scenarioRuntime.restart();
    scenarioRuntime.play();
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4" data-animation-options>
      <div className="flex flex-col gap-2 border-b border-border py-3.5">
        <Row label="Preset">
          <select
            aria-label="Animation preset"
            className={selectClass}
            value={presetValue}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "none") {
                removeEffects();
                return;
              }
              const preset = PRESETS.find((candidate) => candidate.type === value);
              if (preset) applyEffect({ type: preset.type, params: preset.params });
            }}
          >
            {presetValue === "mixed" ? (
              <option value="mixed" disabled>
                Mixed
              </option>
            ) : null}
            {presetValue === "unsupported" ? (
              <option value="unsupported" disabled>
                Unsupported effect
              </option>
            ) : null}
            <option value="none">None</option>
            {PRESETS.map((preset) => (
              <option key={preset.type} value={preset.type}>
                {preset.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Direction">
          <select
            aria-label="Animation direction"
            className={selectClass}
            disabled={!hasEffect}
            value={
              summary.direction.status === "uniform"
                ? summary.direction.value
                : summary.direction.status === "mixed"
                  ? "mixed"
                  : "none"
            }
            onChange={(event) => {
              const value = event.target.value as AnimationDirectionV1;
              if (DIRECTIONS.some((item) => item.value === value)) {
                patchEffects({ effect: { params: { direction: value } } });
              }
            }}
          >
            {summary.direction.status === "mixed" ? (
              <option value="mixed" disabled>
                Mixed
              </option>
            ) : null}
            {summary.direction.status === "none" ? (
              <option value="none" disabled>
                —
              </option>
            ) : null}
            {DIRECTIONS.map((direction) => (
              <option key={direction.value} value={direction.value}>
                {direction.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Duration">
          <div className="relative">
            <input
              type="number"
              min={0.05}
              max={60}
              step={0.05}
              aria-label="Animation duration"
              className={cn(inputClass, "pr-7")}
              placeholder={summary.duration.status === "mixed" ? "—" : "0.00"}
              disabled={!hasEffect}
              value={numericValue(summary.duration, 1_000)}
              onChange={(event) => {
                const seconds = Number(event.target.value);
                if (Number.isFinite(seconds) && seconds > 0) {
                  patchEffects({
                    durationMs: Math.min(60_000, Math.max(50, seconds * 1_000)),
                  });
                }
              }}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
              s
            </span>
          </div>
        </Row>

        <Row label="Delay">
          <div className="relative">
            <input
              type="number"
              min={0}
              max={60}
              step={0.05}
              aria-label="Animation delay"
              className={cn(inputClass, "pr-7")}
              placeholder={summary.delay.status === "mixed" ? "—" : "0.00"}
              disabled={!hasEffect}
              value={numericValue(summary.delay, 1_000)}
              onChange={(event) => {
                const seconds = Number(event.target.value);
                if (Number.isFinite(seconds) && seconds >= 0) {
                  patchEffects({
                    startMs: Math.min(60_000, Math.max(0, seconds * 1_000)),
                  });
                }
              }}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
              s
            </span>
          </div>
        </Row>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 w-full"
          disabled={!hasEffect || reduced}
          onClick={previewSelection}
        >
          Preview selection
        </Button>
        {reduced ? (
          <p className="text-[10px] leading-4 text-muted-foreground">
            Motion is reduced. Set Motion to Full in Settings to preview.
          </p>
        ) : null}
      </div>

      <details className="group border-b border-border py-3.5">
        <summary className="cursor-pointer select-none text-xs font-semibold text-foreground outline-none">
          Advanced
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <Row label="Color">
            <input
              type="color"
              aria-label="Animation color"
              disabled={!hasEffect || summary.color.status !== "uniform"}
              value={
                summary.color.status === "uniform" ? summary.color.value : "#38bdf8"
              }
              onChange={(event) =>
                patchEffects(createAnimationColorPatch(event.target.value))
              }
              className="h-8 w-full cursor-pointer rounded-lg border border-border bg-input p-1 disabled:cursor-not-allowed disabled:opacity-45"
            />
          </Row>
          <Row label="Width">
            <input
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              aria-label="Animation width"
              className={inputClass}
              placeholder="—"
              disabled={!hasEffect}
              value={numericValue(summary.width)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value > 0) {
                  patchEffects(createAnimationWidthPatch(value));
                }
              }}
            />
          </Row>
          <Row label="Opacity">
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              aria-label="Animation opacity"
              className={inputClass}
              placeholder="—"
              disabled={!hasEffect}
              value={numericValue(summary.opacity)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) {
                  patchEffects({
                    effect: {
                      params: { opacity: Math.min(1, Math.max(0, value)) },
                    },
                  });
                }
              }}
            />
          </Row>
          <Row label="Glow">
            <input
              type="number"
              min={0}
              max={32}
              step={1}
              aria-label="Animation glow"
              className={inputClass}
              placeholder="—"
              disabled={!hasEffect}
              value={numericValue(summary.glow)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) {
                  patchEffects({
                    effect: {
                      params: { glowBlurPx: Math.min(32, Math.max(0, value)) },
                    },
                  });
                }
              }}
            />
          </Row>
        </div>
      </details>
    </div>
  );
}
