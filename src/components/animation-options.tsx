import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  createGradientBeamClip,
  createGradientBeamEffect,
} from "@/animation/gradient-beam";
import { buildRequestFlow } from "@/animation/request-flow";
import {
  findAuthoredCustomPaths,
  type AnimationPathPreset,
} from "@/animation/custom-path";
import { scenarioRuntime } from "@/animation/runtime-instance";
import { getNodeDisplayName, useFlowStore } from "@/store/flow-store";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Check, ChevronDown, X } from "@/ui/icons";
import { Slider } from "@/ui/slider";
import { cn } from "@/lib/utils";

export const ANIMATION_PRESETS: Array<{
  type: EdgeEffectPreset;
  label: string;
  params: JsonObject;
  clip?: ScenarioClipPatchV1;
}> = [
  {
    type: "edge.gradient-beam",
    label: "Gradient beam",
    params: createGradientBeamEffect().params,
    clip: createGradientBeamClip(),
  },
];

const DIRECTIONS: Array<{ value: AnimationDirectionV1; label: string }> = [
  { value: "forward", label: "Forward" },
  { value: "reverse", label: "Reverse" },
  { value: "bidirectional", label: "Bidirectional" },
  { value: "ping-pong", label: "Ping-pong" },
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-7 grid-cols-[72px_1fr] items-center gap-2">
      <span className="truncate text-xs font-medium text-foreground/70">
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

export function Picker({
  label,
  value,
  options,
  disabled,
  onChange,
  preview,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
  preview?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(176, rect.width);
    const left = Math.min(
      rect.left,
      Math.max(8, window.innerWidth - width - 8)
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    setPosition(
      spaceBelow < 240
        ? { left, bottom: window.innerHeight - rect.top + 4, width }
        : { left, top: rect.bottom + 4, width }
    );
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-input px-2 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45",
          open && "ring-1 ring-ring"
        )}
      >
        {preview}
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={`${label} options`}
            className="fixed z-50 max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-border/60 bg-popover p-1.5 shadow-xl"
            style={position}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-7 w-full items-center rounded-lg px-2 text-left text-xs transition-colors hover:bg-muted",
                  option.value === value
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value ? (
                  <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                ) : null}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

function secondsValue(state: FieldState<number | undefined>) {
  return state.status === "uniform" && typeof state.value === "number"
    ? state.value / 1_000
    : null;
}

function TimingRow({
  label,
  ariaLabel,
  state,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  state: FieldState<number | undefined>;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (seconds: number) => void;
}) {
  const value = secondsValue(state);
  return (
    <Row label={label}>
      <Slider
        min={min}
        max={max}
        step={0.05}
        value={value ?? min}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="min-w-0 flex-1"
        aria-label={`${ariaLabel} slider`}
      />
      <div className="relative w-14 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          step={0.05}
          aria-label={ariaLabel}
          disabled={disabled}
          value={value ?? ""}
          placeholder={state.status === "mixed" ? "—" : "0"}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          className="h-7 w-full rounded-md bg-input pl-1.5 pr-4 text-right text-[11px] tabular-nums text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-45"
        />
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-foreground/60">
          s
        </span>
      </div>
    </Row>
  );
}

function ValueRow({
  label,
  ariaLabel,
  state,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  state: FieldState<number | undefined>;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const value =
    state.status === "uniform" && typeof state.value === "number"
      ? state.value
      : null;
  return (
    <Row label={label}>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value ?? min}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="min-w-0 flex-1"
        aria-label={`${ariaLabel} slider`}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        disabled={disabled}
        value={value ?? ""}
        placeholder="—"
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-7 w-11 shrink-0 rounded-md bg-input px-1.5 text-right text-[11px] tabular-nums text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-45"
      />
    </Row>
  );
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={cn(
        "relative flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md bg-input px-2 text-xs text-foreground transition-colors hover:bg-muted",
        disabled && "cursor-not-allowed opacity-45"
      )}
    >
      <span
        className="h-4 w-4 shrink-0 rounded border border-foreground/15"
        style={{ backgroundColor: value ?? "transparent" }}
      />
      <span className="truncate tabular-nums">
        {value ? value.replace("#", "").toUpperCase() : "Mixed"}
      </span>
      <input
        type="color"
        aria-label={label}
        disabled={disabled || value === null}
        value={value ?? "#808080"}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </label>
  );
}

export function createAnimationColorPatch(color: string): ScenarioClipPatchV1 {
  return { effect: { params: { color } } };
}

export function createAnimationWidthPatch(value: number): ScenarioClipPatchV1 {
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
  return {
    preset,
    direction: summarizeEdgeEffectField(document, selectedEdgeIds, (clip) => {
      const value = clip.effect.params.direction;
      return typeof value === "string" ? value : undefined;
    }),
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
    secondaryColor: summarizeEdgeEffectField(
      document,
      selectedEdgeIds,
      (clip) => {
        const colors = clip.effect.params.colors;
        const secondary = clip.effect.params.secondaryColor;
        if (Array.isArray(colors) && typeof colors[1] === "string") {
          return colors[1];
        }
        return typeof secondary === "string" ? secondary : undefined;
      }
    ),
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

function playAllAnimations() {
  scenarioRuntime.setTargetScope(null);
  scenarioRuntime.setLoop(true);
  scenarioRuntime.restart();
  scenarioRuntime.play();
}

const EMPTY_ANIMATION_PATH_DRAFT = {
  scenarioId: null,
  name: "",
  preset: "single-line" as const,
  staggerMs: 0,
  appearance: {
    colors: ["#ffaa40", "#9c40ff"] as [string, string],
    responseColors: ["#38bdf8", "#818cf8"] as [string, string],
    widthPx: 2,
    beamLengthPx: 48,
    opacity: 1,
    glowBlurPx: 0,
    shimmer: true,
  },
  nodeIds: [],
  edgeIds: [],
  error: null,
};

const PATH_PRESETS: Array<{ value: AnimationPathPreset; label: string }> = [
  { value: "single-line", label: "Single line" },
  { value: "bidirectional", label: "Bi-directional" },
  { value: "multiple-inputs", label: "Multiple inputs" },
  { value: "multiple-outputs", label: "Multiple outputs" },
  { value: "request-response", label: "Request + response" },
  { value: "scatter-gather", label: "Scatter + gather" },
  { value: "round-robin", label: "Round robin" },
  { value: "failover", label: "Fallback / failover" },
  { value: "cascade", label: "Cascade / tree" },
  { value: "loop", label: "Loop / polling" },
];

const PATH_PRESET_HELP: Record<AnimationPathPreset, string> = {
  "single-line":
    "Click connected blocks in order. Each click adds the next request hop.",
  bidirectional:
    "Click two connected blocks. Beams travel both ways at the same time.",
  "multiple-inputs":
    "Click the receiving block first, then each block that sends into it.",
  "multiple-outputs":
    "Click the source block first, then each receiver. Output timing can be simultaneous or staggered.",
  "request-response":
    "Click a request route in order. The response returns along the same route.",
  "scatter-gather":
    "Click the source, at least two workers, then their shared result block.",
  "round-robin":
    "Click the router first, then outputs in the order they should receive work.",
  "staggered-outputs":
    "Click the source first, then outputs. Each beam starts after a tunable delay.",
  failover:
    "Click the source, primary destination, then the fallback destination.",
  cascade:
    "Click the root first, then add connected descendants to build a tree.",
  loop:
    "Click connected blocks in order, then click the first block again to close the loop.",
};

const OUTPUT_TIMING_OPTIONS = [
  { value: "simultaneous", label: "Simultaneous" },
  { value: "staggered", label: "Staggered" },
];

export function OutputTimingControls({
  staggerMs,
  onChange,
}: {
  staggerMs: number;
  onChange: (staggerMs: number) => void;
}) {
  const staggered = staggerMs > 0;
  return (
    <div className="flex flex-col gap-2">
      <Row label="Output timing">
        <Picker
          label="Output timing"
          value={staggered ? "staggered" : "simultaneous"}
          options={OUTPUT_TIMING_OPTIONS}
          onChange={(value) =>
            onChange(value === "staggered" ? Math.max(staggerMs, 300) : 0)
          }
        />
      </Row>
      {staggered ? (
        <TimingRow
          label="Stagger"
          ariaLabel="Path stagger delay"
          state={{ status: "uniform", value: staggerMs }}
          min={0.1}
          max={2}
          disabled={false}
          onChange={(seconds) => onChange(seconds * 1_000)}
        />
      ) : null}
    </div>
  );
}

const ANIMATION_PATH_DRAG_MIME = "application/x-netviz-animation-path";

export function AnimationPathDragHandle({ name }: { name: string }) {
  return (
    <span
      role="img"
      aria-label={`Drag ${name} to reorder`}
      title="Drag to reorder"
      className="flex h-5 w-3 shrink-0 cursor-grab items-center justify-center text-muted-foreground/60 active:cursor-grabbing"
    >
      <svg viewBox="0 0 8 14" className="h-3.5 w-2" aria-hidden="true">
        {[2, 7, 12].flatMap((y) => [2, 6].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="currentColor" />
        )))}
      </svg>
    </span>
  );
}

export function AnimationPathDeleteConfirmation({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete animation?</DialogTitle>
        <DialogDescription>
          “{name}” will be permanently removed. This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          Delete animation
        </Button>
      </DialogFooter>
    </>
  );
}

export function AnimationOverview() {
  const edgeCount = useFlowStore((state) => state.edges.length);
  const animateAllEdges = useFlowStore((state) => state.animateAllEdges);
  const beginAnimationPath = useFlowStore(
    (state) => state.beginAnimationPath
  );

  return (
    <div className="border-b border-border px-4 py-3.5">
      <p className="text-[13px] font-semibold text-foreground">Connections</p>
      <p className="pb-3 pt-1 text-xs font-medium leading-[18px] text-foreground/70">
        Apply one continuous gradient beam to every connection on this page.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full gap-2 rounded-md text-xs"
        disabled={edgeCount === 0}
        onClick={() => {
          animateAllEdges();
          playAllAnimations();
        }}
      >
        <span className="h-[2px] w-6 rounded-full bg-gradient-to-r from-[#ffaa40] to-[#9c40ff]" />
        Animate all connections
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 h-7 w-full rounded-md text-xs"
        disabled={edgeCount === 0}
        onClick={() => beginAnimationPath()}
      >
        Build custom path
      </Button>
    </div>
  );
}

export function ExistingAnimationPath() {
  const document = useFlowStore((state) => state.scenarioDocument);
  const edges = useFlowStore((state) => state.edges);
  const nodes = useFlowStore((state) => state.nodes);
  const editAnimationPath = useFlowStore((state) => state.editAnimationPath);
  const activateAnimationPath = useFlowStore(
    (state) => state.activateAnimationPath
  );
  const reorderAnimationPath = useFlowStore(
    (state) => state.reorderAnimationPath
  );
  const deleteAnimationPath = useFlowStore(
    (state) => state.deleteAnimationPath
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    scenarioId: string;
    name: string;
  } | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<
    string | null | undefined
  >(undefined);
  const paths = useMemo(
    () => findAuthoredCustomPaths(document, edges),
    [document, edges]
  );
  if (paths.length === 0) return null;

  const clearDrag = () => {
    setDraggingId(null);
    setDropBeforeId(undefined);
  };

  const updateDropTarget = (
    event: DragEvent<HTMLDivElement>,
    index: number
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    setDropBeforeId(
      event.clientY < bounds.top + bounds.height / 2
        ? paths[index].scenarioId
        : paths[index + 1]?.scenarioId ?? null
    );
  };

  return (
    <div
      className="border-b border-border px-4 py-3.5"
      data-existing-animation-path
    >
      <p className="text-[13px] font-semibold text-foreground">Animations</p>
      <div className="mt-2 space-y-2">
        {paths.map((path, index) => {
          const names = path.nodeIds
            .map((id) => nodes.find((node) => node.id === id))
            .filter((node) => node !== undefined)
            .map(getNodeDisplayName);
          const route = (() => {
            if (path.preset === "bidirectional") return names.join(" ↔ ");
            if (path.preset === "multiple-inputs") {
              return `${names.slice(1).join(" + ")} → ${names[0] ?? ""}`;
            }
            if (
              path.preset === "multiple-outputs" ||
              path.preset === "cascade"
            ) {
              return `${names[0] ?? ""} → ${names.slice(1).join(" + ")}`;
            }
            if (path.preset === "scatter-gather") {
              return `${names[0] ?? ""} → ${names.slice(1, -1).join(" + ")} → ${names.at(-1) ?? ""}`;
            }
            if (path.preset === "request-response") {
              return `${names.join(" → ")} ↩`;
            }
            if (path.preset === "round-robin") {
              return `${names.join(" → ")} ↻`;
            }
            if (path.preset === "failover") {
              return `${names[0] ?? ""} → ${names[1] ?? ""} ⇢ ${names[2] ?? ""}`;
            }
            if (path.preset === "loop") {
              return `${names.slice(0, -1).join(" → ")} ↻`;
            }
            return names.join(" → ");
          })();
          const colors = document.scenarios
            .find((scenario) => scenario.id === path.scenarioId)
            ?.tracks.find(
              (track) =>
                track.property === "connection-effect" &&
                track.clips[0]?.effect.type === "edge.gradient-beam"
            )?.clips[0]?.effect.params.colors;
          const gradientColors =
            Array.isArray(colors) &&
            typeof colors[0] === "string" &&
            typeof colors[1] === "string"
              ? [colors[0], colors[1]]
              : ["#ffaa40", "#9c40ff"];
          return (
            <div
              key={path.scenarioId}
              draggable
              data-animation-path-card={path.scenarioId}
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  ANIMATION_PATH_DRAG_MIME,
                  path.scenarioId
                );
                event.dataTransfer.effectAllowed = "move";
                setDraggingId(path.scenarioId);
              }}
              onDragOver={(event) => updateDropTarget(event, index)}
              onDrop={(event) => {
                event.preventDefault();
                const dragged =
                  event.dataTransfer.getData(ANIMATION_PATH_DRAG_MIME) ||
                  draggingId;
                if (dragged) reorderAnimationPath(dragged, dropBeforeId ?? null);
                clearDrag();
              }}
              onDragEnd={clearDrag}
              className={cn(
                "relative rounded-lg bg-input p-2.5 transition-opacity",
                draggingId === path.scenarioId && "opacity-45"
              )}
            >
              {dropBeforeId === path.scenarioId ? (
                <span className="pointer-events-none absolute -top-[5px] left-1 right-1 h-0.5 rounded-full bg-primary" />
              ) : null}
              {index === paths.length - 1 && dropBeforeId === null ? (
                <span className="pointer-events-none absolute -bottom-[5px] left-1 right-1 h-0.5 rounded-full bg-primary" />
              ) : null}
              <div className="flex items-center gap-2">
                <AnimationPathDragHandle name={path.name} />
                <span
                  className="h-[2px] w-5 shrink-0 rounded-full"
                  style={{
                    backgroundImage: `linear-gradient(to right, ${gradientColors[0]}, ${gradientColors[1]})`,
                  }}
                />
                <span className="truncate text-xs font-semibold text-foreground">
                  {path.name === "Default scenario" ? "Custom path" : path.name}
                </span>
                <span className="ml-auto shrink-0 text-[11px] font-medium text-foreground/60">
                  {new Set(path.nodeIds).size} blocks
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-[17px] text-foreground/70">
                {route}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 rounded-md text-xs"
                  onClick={() => editAnimationPath(path.scenarioId)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 rounded-md text-xs"
                  onClick={() => {
                    activateAnimationPath(path.scenarioId);
                    playAllAnimations();
                  }}
                >
                  Play
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${
                    path.name === "Default scenario"
                      ? "Custom path"
                      : path.name
                  }`}
                  className="h-6 rounded-md text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() =>
                    setDeleteTarget({
                      scenarioId: path.scenarioId,
                      name:
                        path.name === "Default scenario"
                          ? "Custom path"
                          : path.name,
                    })
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <AnimationPathDeleteConfirmation
            name={deleteTarget?.name ?? "Custom path"}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => {
              if (!deleteTarget) return;
              const { scenarioId } = deleteTarget;
              setDeleteTarget(null);
              deleteAnimationPath(scenarioId);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RequestFlowOptions({
  nodeId,
  nodeLabel,
}: {
  nodeId: string;
  nodeLabel: string;
}) {
  const edges = useFlowStore((state) => state.edges);
  const animateRequestFlow = useFlowStore(
    (state) => state.animateRequestFlow
  );
  const beginAnimationPath = useFlowStore(
    (state) => state.beginAnimationPath
  );
  const connectionCount = useMemo(
    () => buildRequestFlow(edges, nodeId).length,
    [edges, nodeId]
  );

  return (
    <div className="border-b border-border px-4 py-3.5">
      <p className="text-[13px] font-semibold text-foreground">Request flow</p>
      <p className="pb-3 pt-1 text-xs font-medium leading-[18px] text-foreground/70">
        Start at <span className="text-foreground">{nodeLabel}</span> and
        follow every outgoing connection one hop at a time.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full gap-2 rounded-md text-xs"
        disabled={connectionCount === 0}
        onClick={() => {
          animateRequestFlow(nodeId);
          playAllAnimations();
        }}
      >
        <span className="h-[2px] w-6 rounded-full bg-gradient-to-r from-[#ffaa40] to-[#9c40ff]" />
        Create request flow
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 h-7 w-full rounded-md text-xs"
        disabled={connectionCount === 0}
        onClick={() => beginAnimationPath(nodeId)}
      >
        Build custom path
      </Button>
      <p className="pt-2 text-center text-[11px] font-medium text-foreground/60">
        {connectionCount} reachable connection{connectionCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function AnimationPathBuilder() {
  const draft =
    useFlowStore((state) => state.animationPathDraft) ??
    EMPTY_ANIMATION_PATH_DRAFT;
  const nodes = useFlowStore((state) => state.nodes);
  const beginAnimationPath = useFlowStore(
    (state) => state.beginAnimationPath
  );
  const undoAnimationPathNode = useFlowStore(
    (state) => state.undoAnimationPathNode
  );
  const cancelAnimationPath = useFlowStore(
    (state) => state.cancelAnimationPath
  );
  const setAnimationPathName = useFlowStore(
    (state) => state.setAnimationPathName
  );
  const setAnimationPathPreset = useFlowStore(
    (state) => state.setAnimationPathPreset
  );
  const setAnimationPathStaggerMs = useFlowStore(
    (state) => state.setAnimationPathStaggerMs
  );
  const setAnimationPathAppearance = useFlowStore(
    (state) => state.setAnimationPathAppearance
  );
  const animateDraftPath = useFlowStore((state) => state.animateDraftPath);

  const pathNodes = draft.nodeIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node) => node !== undefined);
  const canSave = (() => {
    if (draft.preset === "bidirectional") return draft.edgeIds.length === 1;
    if (draft.preset === "failover") return draft.edgeIds.length === 2;
    if (draft.preset === "scatter-gather") {
      const workerCount = draft.nodeIds.length - 2;
      return workerCount >= 2 && draft.edgeIds.length === workerCount * 2;
    }
    if (draft.preset === "loop") {
      return (
        draft.edgeIds.length >= 2 &&
        draft.nodeIds[0] === draft.nodeIds[draft.nodeIds.length - 1]
      );
    }
    if (
      draft.preset === "multiple-inputs" ||
      draft.preset === "multiple-outputs" ||
      draft.preset === "round-robin" ||
      draft.preset === "cascade"
    ) {
      return draft.edgeIds.length >= 2;
    }
    return draft.edgeIds.length >= 1;
  })();

  return (
    <div className="flex-1 overflow-y-auto pb-4" data-animation-path-builder>
      <div className="border-b border-border px-4 py-3.5">
        <p className="text-[13px] font-semibold text-foreground">Custom path</p>
        <p className="pb-3 pt-1 text-xs font-medium leading-[18px] text-foreground/70">
          {PATH_PRESET_HELP[draft.preset]}
        </p>

        <label className="mb-3 block text-xs font-medium text-foreground/70">
          Path name
          <Input
            aria-label="Path name"
            className="mt-1 h-7 text-xs"
            value={draft.name}
            placeholder="Custom path"
            onChange={(event) => setAnimationPathName(event.target.value)}
          />
        </label>

        <div className="mb-3 flex flex-col gap-2">
          <Row label="Path preset">
            <Picker
              label="Path preset"
              value={draft.preset}
              options={PATH_PRESETS}
              onChange={(value) =>
                setAnimationPathPreset(value as AnimationPathPreset)
              }
            />
          </Row>
          {draft.preset === "multiple-outputs" ? (
            <OutputTimingControls
              staggerMs={draft.staggerMs}
              onChange={setAnimationPathStaggerMs}
            />
          ) : null}
        </div>

        {pathNodes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs font-medium leading-[18px] text-foreground/70">
            {draft.preset === "multiple-inputs"
              ? "Click the receiving block on the canvas"
              : draft.preset === "multiple-outputs" ||
                  draft.preset === "round-robin" ||
                  draft.preset === "failover" ||
                  draft.preset === "scatter-gather"
                ? "Click the source block on the canvas"
                : "Click the first block on the canvas"}
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto rounded-lg bg-input p-1.5">
            {pathNodes.map((node, index) => (
              <div
                key={`${node.id}-${index}`}
                className="flex min-h-8 items-center gap-2 rounded-md px-2"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <span className="truncate text-xs font-medium text-foreground">
                  {getNodeDisplayName(node)}
                </span>
              </div>
            ))}
          </div>
        )}

        {draft.error ? (
          <p className="pt-2 text-xs font-medium leading-[18px] text-destructive">
            {draft.error}
          </p>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-md text-xs"
            disabled={draft.nodeIds.length === 0}
            onClick={undoAnimationPathNode}
          >
            Undo last
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-md text-xs"
            disabled={draft.nodeIds.length === 0}
            onClick={() => beginAnimationPath()}
          >
            Start over
          </Button>
        </div>
      </div>

      <div className="border-b border-border px-4 py-3.5">
        <p className="pb-2.5 text-[13px] font-semibold text-foreground">
          Appearance
        </p>
        <div className="flex flex-col gap-2">
          <Row label="Start">
            <ColorField
              label="Path start color"
              value={draft.appearance.colors[0]}
              disabled={false}
              onChange={(color) =>
                setAnimationPathAppearance({
                  colors: [color, draft.appearance.colors[1]],
                })
              }
            />
          </Row>
          <Row label="End">
            <ColorField
              label="Path end color"
              value={draft.appearance.colors[1]}
              disabled={false}
              onChange={(color) =>
                setAnimationPathAppearance({
                  colors: [draft.appearance.colors[0], color],
                })
              }
            />
          </Row>
          {draft.preset === "request-response" ? (
            <>
              <Row label="Reply start">
                <ColorField
                  label="Response start color"
                  value={draft.appearance.responseColors[0]}
                  disabled={false}
                  onChange={(color) =>
                    setAnimationPathAppearance({
                      responseColors: [
                        color,
                        draft.appearance.responseColors[1],
                      ],
                    })
                  }
                />
              </Row>
              <Row label="Reply end">
                <ColorField
                  label="Response end color"
                  value={draft.appearance.responseColors[1]}
                  disabled={false}
                  onChange={(color) =>
                    setAnimationPathAppearance({
                      responseColors: [
                        draft.appearance.responseColors[0],
                        color,
                      ],
                    })
                  }
                />
              </Row>
            </>
          ) : null}
          <ValueRow
            label="Width"
            ariaLabel="Path animation width"
            state={{ status: "uniform", value: draft.appearance.widthPx }}
            min={0.5}
            max={24}
            step={0.5}
            disabled={false}
            onChange={(widthPx) =>
              setAnimationPathAppearance({ widthPx })
            }
          />
          <ValueRow
            label="Length"
            ariaLabel="Path beam length"
            state={{ status: "uniform", value: draft.appearance.beamLengthPx }}
            min={8}
            max={240}
            step={1}
            disabled={false}
            onChange={(beamLengthPx) =>
              setAnimationPathAppearance({ beamLengthPx })
            }
          />
          <ValueRow
            label="Opacity"
            ariaLabel="Path animation opacity"
            state={{ status: "uniform", value: draft.appearance.opacity }}
            min={0}
            max={1}
            step={0.05}
            disabled={false}
            onChange={(opacity) =>
              setAnimationPathAppearance({ opacity })
            }
          />
          <ValueRow
            label="Glow"
            ariaLabel="Path animation glow"
            state={{ status: "uniform", value: draft.appearance.glowBlurPx }}
            min={0}
            max={32}
            step={1}
            disabled={false}
            onChange={(glowBlurPx) =>
              setAnimationPathAppearance({ glowBlurPx })
            }
          />
          <Row label="Block shimmer">
            <button
              type="button"
              role="switch"
              aria-checked={draft.appearance.shimmer}
              aria-label="Block shimmer"
              onClick={() =>
                setAnimationPathAppearance({
                  shimmer: !draft.appearance.shimmer,
                })
              }
              className={cn(
                "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
                draft.appearance.shimmer ? "bg-primary" : "bg-accent"
              )}
            >
              <span
                className={cn(
                  "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  draft.appearance.shimmer
                    ? "translate-x-4"
                    : "translate-x-0"
                )}
              />
            </button>
          </Row>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 px-4 py-3.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-md text-xs"
          onClick={cancelAnimationPath}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 rounded-md text-xs"
          disabled={!canSave}
          onClick={() => {
            animateDraftPath();
            playAllAnimations();
          }}
        >
          Save &amp; play
        </Button>
      </div>
    </div>
  );
}

export function AnimationOptions() {
  const edges = useFlowStore((state) => state.edges);
  const selectedEdgeIds = useMemo(
    () => edges.filter((edge) => edge.selected).map((edge) => edge.id),
    [edges]
  );
  const document = useFlowStore((state) => state.scenarioDocument);
  const applyEffect = useFlowStore((state) => state.applySelectedEdgeEffect);
  const patchEffects = useFlowStore((state) => state.patchSelectedEdgeEffects);
  const removeEffects = useFlowStore((state) => state.removeSelectedEdgeEffects);
  const beginAnimationPath = useFlowStore(
    (state) => state.beginAnimationPath
  );
  const summary = useMemo(
    () => summarizeAnimationSelection(document, selectedEdgeIds),
    [document, selectedEdgeIds]
  );

  const hasBeam =
    summary.preset.status === "uniform" &&
    summary.preset.value === "edge.gradient-beam";
  const currentPrimary =
    summary.color.status === "uniform" ? summary.color.value ?? null : null;
  const currentSecondary =
    summary.secondaryColor.status === "uniform"
      ? summary.secondaryColor.value ?? null
      : null;

  return (
    <div className="flex-1 overflow-y-auto pb-4" data-animation-options>
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3.5">
        {hasBeam ? (
          <div className="mb-1 flex h-7 items-center gap-2">
            <span className="h-[2px] w-6 rounded-full bg-gradient-to-r from-[#ffaa40] to-[#9c40ff]" />
            <span className="text-xs font-medium text-foreground">
              Gradient beam
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7 rounded-md"
              aria-label="Remove gradient beam"
              onClick={removeEffects}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-full gap-2 rounded-md text-xs"
            onClick={() =>
              applyEffect(createGradientBeamEffect(), createGradientBeamClip())
            }
          >
            <span className="h-[2px] w-6 rounded-full bg-gradient-to-r from-[#ffaa40] to-[#9c40ff]" />
            Add gradient beam
          </Button>
        )}
        <Row label="Direction">
          <Picker
            label="Animation direction"
            value={
              summary.direction.status === "uniform"
                ? summary.direction.value ?? "forward"
                : summary.direction.status === "mixed"
                  ? "mixed"
                  : "none"
            }
            options={[
              ...DIRECTIONS,
              ...(summary.direction.status === "mixed"
                ? [{ value: "mixed", label: "Mixed" }]
                : []),
              ...(summary.direction.status === "none"
                ? [{ value: "none", label: "—" }]
                : []),
            ]}
            disabled={!hasBeam}
            onChange={(value) => {
              if (DIRECTIONS.some((item) => item.value === value)) {
                patchEffects({
                  effect: {
                    params: { direction: value as AnimationDirectionV1 },
                  },
                });
              }
            }}
          />
        </Row>
        <TimingRow
          label="Travel time"
          ariaLabel="Beam travel time"
          state={summary.duration}
          min={0.4}
          max={8}
          disabled={!hasBeam}
          onChange={(seconds) =>
            patchEffects({
              durationMs: Math.min(8_000, Math.max(400, seconds * 1_000)),
              easing: "linear",
            })
          }
        />
        <TimingRow
          label="Start delay"
          ariaLabel="Beam start delay"
          state={summary.delay}
          min={0}
          max={10}
          disabled={!hasBeam}
          onChange={(seconds) =>
            patchEffects({
              startMs: Math.min(10_000, Math.max(0, seconds * 1_000)),
            })
          }
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-full gap-2 rounded-md text-xs"
          onClick={() => beginAnimationPath()}
        >
          <span className="h-[2px] w-6 rounded-full bg-gradient-to-r from-[#ffaa40] to-[#9c40ff]" />
          Build custom path
        </Button>
      </div>

      <div className="border-b border-border px-4 py-3.5">
        <p className="pb-2.5 text-[13px] font-semibold text-foreground">
          Advanced
        </p>
        <div className="flex flex-col gap-2">
          <Row label="Start">
            <ColorField
              label="Animation start color"
              value={currentPrimary}
              disabled={!hasBeam}
              onChange={(color) => {
                if (currentSecondary) {
                  patchEffects({
                    effect: { params: { colors: [color, currentSecondary] } },
                  });
                } else {
                  patchEffects(createAnimationColorPatch(color));
                }
              }}
            />
          </Row>
          <Row label="End">
            <ColorField
              label="Animation end color"
              value={currentSecondary}
              disabled={!hasBeam}
              onChange={(color) => {
                if (currentPrimary) {
                  patchEffects({
                    effect: { params: { colors: [currentPrimary, color] } },
                  });
                } else {
                  patchEffects({ effect: { params: { secondaryColor: color } } });
                }
              }}
            />
          </Row>
          <ValueRow
            label="Width"
            ariaLabel="Animation width"
            state={summary.width}
            min={0.5}
            max={24}
            step={0.5}
            disabled={!hasBeam}
            onChange={(value) =>
              patchEffects(createAnimationWidthPatch(value))
            }
          />
          <ValueRow
            label="Opacity"
            ariaLabel="Animation opacity"
            state={summary.opacity}
            min={0}
            max={1}
            step={0.05}
            disabled={!hasBeam}
            onChange={(value) =>
              patchEffects({
                effect: { params: { opacity: Math.min(1, Math.max(0, value)) } },
              })
            }
          />
          <ValueRow
            label="Glow"
            ariaLabel="Animation glow"
            state={summary.glow}
            min={0}
            max={32}
            step={1}
            disabled={!hasBeam}
            onChange={(value) =>
              patchEffects({
                effect: {
                  params: { glowBlurPx: Math.min(32, Math.max(0, value)) },
                },
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
