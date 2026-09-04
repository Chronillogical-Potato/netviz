import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Search,
  Upload,
  X,
} from "@/ui/icons";
import {
  getNodeDisplayName,
  resolveBlock,
  useFlowStore,
  type AppNode,
  type ArrowShape,
  type BorderStyle,
  type CodeLanguage,
  type CodeNode,
  type IconPosition,
  type ImageNode,
  type InfraNode,
  type InfraShape,
  type LineNode,
  type ShapeNode,
  type StepNode,
  type TextAlign,
  type TextNode,
} from "@/store/flow-store";
import {
  ACCENT_CLASSES,
  COLOR_PRESETS,
  type Accent,
} from "@/blocks/registry";
import { ICON_NAMES, canonicalIconName, resolveIcon } from "@/blocks/icons";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Segmented } from "@/ui/segmented";
import { Slider } from "@/ui/slider";
import { CanvasOptions, PageOptions } from "./canvas-options";
import {
  AnimationOptions,
  AnimationOverview,
  AnimationPathBuilder,
  ExistingAnimationPath,
  Picker,
  RequestFlowOptions,
} from "./animation-options";
import { PlaybackControls } from "./playback-controls";
import { cn } from "@/lib/utils";
import {
  deriveLegacyLineEndpoints,
  lineAngleDegrees,
  rotateLineToAngle,
} from "@/lib/line-geometry";

function VideoSettings() {
  const videoTitle = useFlowStore((state) => state.videoTitle);
  const videoStartDelayMs = useFlowStore(
    (state) => state.videoStartDelayMs
  );
  const videoBetweenDelayMs = useFlowStore(
    (state) => state.videoBetweenDelayMs
  );
  const videoEndDelayMs = useFlowStore((state) => state.videoEndDelayMs);
  const videoCameraFollowEnabled = useFlowStore(
    (state) => state.videoCameraFollowEnabled
  );
  const setVideoTitle = useFlowStore((state) => state.setVideoTitle);
  const setVideoStartDelayMs = useFlowStore(
    (state) => state.setVideoStartDelayMs
  );
  const setVideoBetweenDelayMs = useFlowStore(
    (state) => state.setVideoBetweenDelayMs
  );
  const setVideoEndDelayMs = useFlowStore(
    (state) => state.setVideoEndDelayMs
  );
  const setVideoCameraFollowEnabled = useFlowStore(
    (state) => state.setVideoCameraFollowEnabled
  );

  return (
    <>
      <Section title="Presentation">
        <Row label="Title">
          <FieldInput
            value={videoTitle}
            onChange={(event) => setVideoTitle(event.target.value)}
            placeholder="Current animation name"
            aria-label="Video title"
          />
        </Row>
      </Section>
      <Section title="Delay">
        <VideoDelayRow
          label="Start"
          ariaLabel="Start delay"
          value={videoStartDelayMs}
          onChange={setVideoStartDelayMs}
        />
        <VideoDelayRow
          label="Between"
          ariaLabel="Between animations delay"
          value={videoBetweenDelayMs}
          onChange={setVideoBetweenDelayMs}
        />
        <VideoDelayRow
          label="End"
          ariaLabel="End delay"
          value={videoEndDelayMs}
          onChange={setVideoEndDelayMs}
        />
      </Section>
      <Section title="Camera">
        <Row label="Follow">
          <Picker
            label="Camera follow"
            value={videoCameraFollowEnabled ? "enabled" : "disabled"}
            options={[
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Disabled" },
            ]}
            onChange={(value) =>
              setVideoCameraFollowEnabled(value === "enabled")
            }
          />
        </Row>
        <p className="text-xs font-medium leading-[18px] text-foreground/70">
          {videoCameraFollowEnabled
            ? "The canvas follows the active request when the full diagram does not fit onscreen."
            : "Keeps your saved zoom and canvas position during playback."}
        </p>
      </Section>
    </>
  );
}

function VideoDelayRow({
  label,
  ariaLabel,
  value,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Row label={label}>
      <Slider
        min={0}
        max={10_000}
        step={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1"
        aria-label={ariaLabel}
      />
      <span className="flex h-7 w-11 shrink-0 items-center justify-end rounded-md bg-input px-1.5 text-[11px] tabular-nums text-foreground">
        {(value / 1_000).toFixed(1)}s
      </span>
    </Row>
  );
}

const ACCENTS: Accent[] = [
  "indigo",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "violet",
  "fuchsia",
  "pink",
  "slate",
];

const STATIC_POSITION = { x: 0, y: 0 };

const NODE_TYPE_LABEL: Record<string, string> = {
  infra: "Block",
  shape: "Shape",
  text: "Text",
  step: "Step",
  line: "Line",
  image: "Image",
  code: "Code",
};

export function Inspector() {
  const workMode = useFlowStore((s) => s.workMode);
  const selectedProjection = useFlowStore(
    useShallow((s) => {
      const n = s.nodes.find((x) => x.selected);
      if (!n) return null;
      // Strip per-frame drag churn (position/dragging) so moving a
      // selected node doesn't re-render the inspector 60×/s. Editors that
      // need the live position read it via useFlowStore.getState().
      return { ...n, position: STATIC_POSITION, dragging: false };
    })
  );
  const selectedNode = selectedProjection as unknown as AppNode | null;
  const hasSelectedEdge = useFlowStore((s) =>
    s.edges.some((e) => e.selected)
  );
  const isBuildingAnimationPath = useFlowStore(
    (s) => s.animationPathDraft !== null
  );

  if (workMode === "animation" || workMode === "video") {
    const isVideo = workMode === "video";
    return (
      <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-background">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[13px] font-semibold text-foreground">
            {isVideo ? "Video" : "Animation"}
          </p>
          <p className="pt-0.5 text-xs font-medium leading-[18px] text-foreground/70">
            {isVideo
              ? "Presentation playback and camera controls"
              : isBuildingAnimationPath
              ? "Pick blocks in order"
              : hasSelectedEdge
              ? "Connection effect"
              : selectedNode
                ? "Build a chained request"
                : "All connections"}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PlaybackControls />
          {isVideo ? (
            <VideoSettings />
          ) : (
            <>
              {!isBuildingAnimationPath ? <ExistingAnimationPath /> : null}
              {isBuildingAnimationPath ? (
                <AnimationPathBuilder />
              ) : hasSelectedEdge ? (
                <AnimationOptions />
              ) : selectedNode ? (
                <RequestFlowOptions
                  nodeId={selectedNode.id}
                  nodeLabel={getNodeDisplayName(selectedNode)}
                />
              ) : (
                <AnimationOverview />
              )}
            </>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-background">
      {selectedNode ? (
        <div className="flex-1 overflow-y-auto pb-4">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold text-foreground">
              {NODE_TYPE_LABEL[selectedNode.type ?? ""] ?? "Layer"}
            </p>
          </div>
          <NodeEditor node={selectedNode} />
          <Section title="Arrange">
            <LayerRow id={selectedNode.id} />
          </Section>
        </div>
      ) : hasSelectedEdge ? (
        <>
          <div className="px-4 pb-1 pt-3">
            <p className="text-xs font-semibold text-foreground">Edge</p>
          </div>
          <CanvasOptions />
        </>
      ) : (
        <>
          <div className="px-4 pb-1 pt-3">
            <p className="text-xs font-semibold text-foreground">Page</p>
          </div>
          <PageOptions />
        </>
      )}
    </aside>
  );
}

/* ── Framer-style panel primitives ─────────────────────────────── */

// A titled block separated from the next section by a hairline.
function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-4 py-3.5 last:border-b-0">
      {title && (
        <p className="pb-2.5 text-xs font-semibold text-foreground">{title}</p>
      )}
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

// Label on the left, control(s) on the right.
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-7 grid-cols-[72px_1fr] items-center gap-2">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

// Small editable number box shown next to sliders (Framer style).
function NumberField({
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v: number) => String(v),
  disabled = false,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (!Number.isNaN(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      onChange(step >= 1 ? Math.round(clamped) : clamped);
    }
    setDraft(null);
  };
  return (
    <input
      inputMode="decimal"
      disabled={disabled}
      value={draft ?? format(value)}
      onFocus={(e) => {
        setDraft(format(value));
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="h-7 w-11 shrink-0 rounded-md bg-input px-1.5 text-right text-[11px] tabular-nums text-foreground outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="Value"
    />
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  return (
    <Row label={label}>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "min-w-0 flex-1",
          disabled && "cursor-not-allowed opacity-50"
        )}
        aria-label={label}
      />
      <NumberField
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        format={format}
        disabled={disabled}
      />
    </Row>
  );
}

// Compact filled text input for rows.
function FieldInput(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} className={cn("h-7 px-2 text-xs", props.className)} />;
}

/* ── Popover control (Framer-style dropdown pickers) ───────────── */

function PopoverControl({
  trigger,
  children,
  panelWidth = 240,
  "aria-label": ariaLabel,
}: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  panelWidth?: number;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current!.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(r.right - panelWidth, window.innerWidth - panelWidth - 8)
    );
    const spaceBelow = window.innerHeight - r.bottom;
    setPos(
      spaceBelow < 340
        ? { left, bottom: window.innerHeight - r.top + 4 }
        : { left, top: r.bottom + 4 }
    );
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Anchored to a fixed position — close if the panel scrolls away.
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        className={cn(
          "flex h-7 w-full min-w-0 flex-1 items-center gap-1.5 rounded-md bg-input px-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted",
          open && "ring-1 ring-ring"
        )}
      >
        {trigger}
        <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-50 overflow-y-auto rounded-xl border border-border/60 bg-popover p-2 shadow-xl"
            style={{
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: panelWidth,
              maxHeight: 400,
            }}
          >
            {children(close)}
          </div>,
          document.body
        )}
    </>
  );
}

function Swatch({ hex }: { hex: string | null | undefined }) {
  const isTransparent = hex === "transparent";
  const style: React.CSSProperties = {};
  if (isTransparent) {
    style.backgroundImage = TRANSPARENT_BG;
    style.backgroundSize = "6px 6px";
  } else if (hex) {
    style.backgroundColor = hex;
  }
  return (
    <span
      className={cn(
        "h-4 w-4 shrink-0 rounded border border-foreground/15",
        !hex && "bg-muted"
      )}
      style={style}
    />
  );
}

function colorLabel(hex: string | undefined) {
  if (hex === undefined) return "Default";
  if (hex === "transparent") return "Transparent";
  return hex.replace("#", "").toUpperCase();
}

// The default palette laid out as a logical matrix: a basics row (none,
// transparent, white → black), then one column per hue with light/mid/dark
// rows — like a design tool's color ramp.
const HUE_ORDER = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "fuchsia",
  "pink",
];
const BASIC_IDS = [
  "none",
  "transparent",
  "white",
  "slate-100",
  "slate-300",
  "slate-500",
  "slate-700",
  "black",
];
const SHADE_ROWS = ["200", "500", "700"];
const presetById = (id: string) => COLOR_PRESETS.find((p) => p.id === id);

function MiniSwatch({
  p,
  active,
  onClick,
}: {
  p: { id: string; hex: string | null; label: string };
  active: boolean;
  onClick: () => void;
}) {
  const isNone = p.hex === null;
  const isTransparent = p.hex === "transparent";
  const style: React.CSSProperties = {};
  if (isTransparent) {
    style.backgroundImage = TRANSPARENT_BG;
    style.backgroundSize = "6px 6px";
  } else if (!isNone) {
    style.backgroundColor = p.hex ?? undefined;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={p.label}
      aria-label={p.label}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-[5px] ring-1 ring-inset ring-foreground/10 transition-transform hover:scale-110",
        isNone && "bg-muted",
        active && "ring-2 ring-inset ring-ring"
      )}
      style={style}
    >
      {isNone ? <X className="h-3 w-3 text-muted-foreground" /> : null}
    </button>
  );
}

// [swatch + value] control that opens a palette dropdown with a custom
// color wheel + hex input at the bottom.
function ColorControl({
  value,
  presets,
  onChange,
}: {
  value: string | undefined;
  presets?: { id: string; hex: string | null; label: string }[];
  onChange: (v: string | undefined) => void;
}) {
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const isMatrix = !presets;
  const customValue = value && value !== "transparent" ? value : "#808080";
  const commitHex = (close: () => void) => {
    if (hexDraft === null) return;
    const v = hexDraft.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(v) || /^[0-9a-fA-F]{3}$/.test(v)) {
      onChange(`#${v.toLowerCase()}`);
      close();
    }
    setHexDraft(null);
  };
  const pick = (close: () => void) => (hex: string | null) => {
    onChange(hex ?? undefined);
    close();
  };
  return (
    <PopoverControl
      panelWidth={240}
      trigger={
        <>
          <Swatch hex={value} />
          <span className="truncate tabular-nums">{colorLabel(value)}</span>
        </>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-2">
          {isMatrix ? (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between">
                {BASIC_IDS.map((id) => {
                  const p = presetById(id);
                  if (!p) return null;
                  return (
                    <MiniSwatch
                      key={p.id}
                      p={p}
                      active={(value ?? null) === p.hex}
                      onClick={() => pick(close)(p.hex)}
                    />
                  );
                })}
              </div>
              <div className="h-px bg-border" />
              {[HUE_ORDER.slice(0, 7), HUE_ORDER.slice(7)].map((bank, bi) =>
                SHADE_ROWS.map((shade) => (
                  <div key={`${bi}-${shade}`} className="flex justify-between">
                    {bank.map((hue) => {
                      const p = presetById(`${hue}-${shade}`);
                      if (!p) return null;
                      return (
                        <MiniSwatch
                          key={p.id}
                          p={p}
                          active={(value ?? null) === p.hex}
                          onClick={() => pick(close)(p.hex)}
                        />
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {(presets ?? []).map((p) => (
                <PresetButton
                  key={p.id}
                  p={p}
                  active={(value ?? null) === p.hex}
                  onClick={() => pick(close)(p.hex)}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-lg bg-muted p-1 pr-2">
            <label
              className="relative block h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded border border-foreground/15"
              style={{ backgroundColor: customValue }}
              title="Custom color"
            >
              <input
                type="color"
                value={customValue}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Custom color"
              />
            </label>
            <input
              value={
                hexDraft ??
                (value && value !== "transparent"
                  ? value.replace("#", "").toUpperCase()
                  : "")
              }
              onFocus={(e) => {
                setHexDraft(
                  value && value !== "transparent"
                    ? value.replace("#", "").toUpperCase()
                    : ""
                );
                e.target.select();
              }}
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={() => commitHex(close)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitHex(close);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setHexDraft(null);
                }
              }}
              placeholder="Custom hex…"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-xs uppercase tabular-nums text-foreground outline-none placeholder:normal-case placeholder:text-muted-foreground/60"
              aria-label="Hex value"
            />
          </div>
        </div>
      )}
    </PopoverControl>
  );
}

// Accent control: swatch + name, dropdown with the accent grid.
function AccentControl({
  value,
  onChange,
}: {
  value: Accent;
  onChange: (a: Accent) => void;
}) {
  const c = ACCENT_CLASSES[value];
  return (
    <PopoverControl
      panelWidth={200}
      trigger={
        <>
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-foreground/10",
              c.tile
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
          </span>
          <span className="truncate capitalize">{value}</span>
        </>
      }
    >
      {(close) => (
        <div className="flex flex-wrap gap-1">
          {ACCENTS.map((a) => {
            const ac = ACCENT_CLASSES[a];
            return (
              <button
                key={a}
                type="button"
                onClick={() => {
                  onChange(a);
                  close();
                }}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-shadow",
                  ac.tile,
                  value === a &&
                    "ring-2 ring-ring ring-offset-1 ring-offset-popover"
                )}
                aria-label={a}
                title={a}
              >
                <span className={cn("h-2 w-2 rounded-full", ac.dot)} />
              </button>
            );
          })}
        </div>
      )}
    </PopoverControl>
  );
}

// Icon control: current icon + name, dropdown with search + catalog grid.
function IconControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  // Stored names can be legacy aliases (e.g. "server") — compare and
  // display via the canonical catalog name.
  const canonical = canonicalIconName(value);
  const Ic = resolveIcon(value);
  return (
    <PopoverControl
      panelWidth={248}
      trigger={
        <>
          {canonical ? (
            <Ic className="h-3.5 w-3.5 shrink-0 text-foreground" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{canonical || "None"}</span>
        </>
      }
    >
      {(close) => (
        <IconPicker
          value={canonical}
          onClose={close}
          onChange={(name) => {
            onChange(name);
            close();
          }}
        />
      )}
    </PopoverControl>
  );
}

function NodeEditor({ node }: { node: AppNode }) {
  if (node.type === "infra") return <InfraEditor node={node as InfraNode} />;
  if (node.type === "shape") return <ShapeEditor node={node as ShapeNode} />;
  if (node.type === "step") return <StepEditor node={node as StepNode} />;
  if (node.type === "line") return <LineEditor node={node as LineNode} />;
  if (node.type === "image") return <ImageEditor node={node as ImageNode} />;
  if (node.type === "code") return <CodeEditor node={node as CodeNode} />;
  return <TextEditor node={node as TextNode} />;
}

function LayerRow({ id }: { id: string }) {
  const bringToFront = useFlowStore((s) => s.bringToFront);
  const bringForward = useFlowStore((s) => s.bringForward);
  const sendBackward = useFlowStore((s) => s.sendBackward);
  const sendToBack = useFlowStore((s) => s.sendToBack);
  const actions = [
    { icon: ChevronsUp, title: "Bring to front", fn: () => bringToFront(id) },
    { icon: ChevronUp, title: "Bring forward", fn: () => bringForward(id) },
    { icon: ChevronDown, title: "Send backward", fn: () => sendBackward(id) },
    { icon: ChevronsDown, title: "Send to back", fn: () => sendToBack(id) },
  ];
  return (
    <Row label="Order">
      {actions.map((a) => {
        const Ic = a.icon;
        return (
          <button
            key={a.title}
            type="button"
            onClick={a.fn}
            title={a.title}
            aria-label={a.title}
            className="flex h-7 flex-1 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Ic className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </Row>
  );
}

function AccentRow({
  label = "Color",
  value,
  onChange,
}: {
  label?: string;
  value: Accent;
  onChange: (a: Accent) => void;
}) {
  return (
    <Row label={label}>
      <AccentControl value={value} onChange={onChange} />
    </Row>
  );
}

const TRANSPARENT_BG =
  "conic-gradient(hsl(var(--muted-foreground) / 0.5) 25%, transparent 25% 50%, hsl(var(--muted-foreground) / 0.5) 50% 75%, transparent 75%)";

function PresetButton({
  p,
  active,
  onClick,
}: {
  p: { id: string; hex: string | null; label: string };
  active: boolean;
  onClick: () => void;
}) {
  const isNone = p.hex === null;
  const isTransparent = p.hex === "transparent";
  const style: React.CSSProperties = {};
  if (isTransparent) {
    style.backgroundImage = TRANSPARENT_BG;
    style.backgroundSize = "8px 8px";
  } else if (!isNone) {
    style.backgroundColor = p.hex ?? undefined;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={p.label}
      aria-label={p.label}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md transition-shadow",
        isNone && "bg-muted",
        active && "ring-2 ring-ring ring-offset-1 ring-offset-background"
      )}
      style={style}
    >
      {isNone ? <X className="h-3 w-3 text-muted-foreground" /> : null}
    </button>
  );
}

type ColorTarget = {
  key: string;
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
};

// Framer-style: one row per color target, each a [swatch + value]
// dropdown control.
function ColorsSection({ targets }: { targets: ColorTarget[] }) {
  return (
    <Section title="Colors">
      {targets.map((t) => (
        <Row key={t.key} label={t.label}>
          <ColorControl value={t.value} onChange={t.onChange} />
        </Row>
      ))}
    </Section>
  );
}

// Rendering all 2680 catalog icons at once is a hot path — cap the grid
// and let search narrow the rest.
const MAX_VISIBLE_ICONS = 240;

const IconPicker = memo(function IconPicker({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (name: string) => void;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICON_NAMES;
    return ICON_NAMES.filter((n) => n.toLowerCase().includes(q));
  }, [query]);
  const shown =
    filtered.length > MAX_VISIBLE_ICONS
      ? filtered.slice(0, MAX_VISIBLE_ICONS)
      : filtered;

  const tile = (active: boolean) =>
    cn(
      "flex h-[52px] items-center justify-center rounded-lg bg-muted text-foreground/80 transition-colors hover:bg-accent hover:text-foreground",
      active &&
        "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
    );

  return (
    <div className="flex flex-col gap-2 p-1">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Icons</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close icon picker"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="h-7 pl-7 text-xs"
        />
      </div>
      <div className="grid max-h-[264px] grid-cols-4 gap-1.5 overflow-y-auto pr-0.5">
        <button
          type="button"
          onClick={() => onChange("")}
          className={tile(value === "")}
          title="None"
          aria-label="No icon"
        >
          <X className="h-4 w-4" />
        </button>
        {shown.map((name) => {
          const Ic = resolveIcon(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              className={tile(value === name)}
              title={name}
              aria-label={name}
            >
              <Ic className="h-5 w-5" />
            </button>
          );
        })}
        {filtered.length > shown.length && (
          <p className="col-span-4 px-2 py-1.5 text-center text-[10px] text-muted-foreground/70">
            +{filtered.length - shown.length} more — search to narrow
          </p>
        )}
        {filtered.length === 0 && (
          <p className="col-span-4 px-2 py-4 text-center text-xs text-muted-foreground">
            No icons match.
          </p>
        )}
      </div>
    </div>
  );
});

function CustomIconRow({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <Row label="Image">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <Upload className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 flex-1 text-[11px]"
        onClick={() => inputRef.current?.click()}
      >
        {value ? "Replace" : "Upload"}
      </Button>
      {value ? (
        <button
          onClick={() => onChange(undefined)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Remove custom icon"
          aria-label="Remove custom icon"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </Row>
  );
}

const ICON_POSITIONS: { id: IconPosition; icon: typeof ArrowLeft; label: string }[] = [
  { id: "left", icon: ArrowLeft, label: "Left" },
  { id: "right", icon: ArrowRight, label: "Right" },
  { id: "top", icon: ArrowUp, label: "Top" },
  { id: "bottom", icon: ArrowDown, label: "Bottom" },
];

const TEXT_ALIGNS: { id: TextAlign; icon: typeof AlignLeft }[] = [
  { id: "left", icon: AlignLeft },
  { id: "center", icon: AlignCenter },
  { id: "right", icon: AlignRight },
];

/* ── Editors ───────────────────────────────────────────────────── */

const CODE_LANGUAGES: CodeLanguage[] = [
  "plaintext",
  "bash",
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "json",
  "yaml",
  "python",
  "go",
  "sql",
  "html",
  "css",
  "markdown",
];

function InfraEditor({ node }: { node: InfraNode }) {
  const customBlocks = useFlowStore((s) => s.customBlocks);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const setInfraShape = useFlowStore((s) => s.setInfraShape);
  const onIconChange = useCallback(
    (name: string) => updateNodeData(node.id, { iconName: name }),
    [node.id, updateNodeData]
  );
  const block = resolveBlock(node.data.blockId, customBlocks);
  const iconName = node.data.iconName ?? block?.iconName ?? "box";
  const accent = node.data.accent ?? block?.accent ?? "slate";
  const iconPosition =
    node.data.iconPosition ?? (block?.variant === "card" ? "top" : "left");
  const textAlign =
    node.data.textAlign ?? (block?.variant === "card" ? "center" : "left");

  return (
    <>
      <Section>
        <Row label="Title">
          <FieldInput
            value={node.data.label}
            onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
          />
        </Row>
        <Row label="Info">
          <FieldInput
            value={node.data.subtitle ?? ""}
            onChange={(e) =>
              updateNodeData(node.id, { subtitle: e.target.value })
            }
            placeholder="Optional"
          />
        </Row>
        <Row label="Align">
          <Segmented
            className="flex-1"
            value={textAlign}
            onChange={(v) => updateNodeData(node.id, { textAlign: v })}
            options={TEXT_ALIGNS.map((a) => ({
              value: a.id,
              icon: a.icon,
              title: a.id,
            }))}
          />
        </Row>
      </Section>
      <Section title="Icon">
        <Row label="Icon">
          <IconControl value={iconName} onChange={onIconChange} />
        </Row>
        <CustomIconRow
          value={node.data.customIcon}
          onChange={(v) => updateNodeData(node.id, { customIcon: v })}
        />
        <Row label="Position">
          <Segmented
            className="flex-1"
            value={iconPosition}
            onChange={(v) => updateNodeData(node.id, { iconPosition: v })}
            options={ICON_POSITIONS.map((p) => ({
              value: p.id,
              icon: p.icon,
              title: p.label,
            }))}
          />
        </Row>
        <AccentRow
          value={accent}
          onChange={(a) => updateNodeData(node.id, { accent: a })}
        />
      </Section>
      <Section title="Style">
        <Row label="Shape">
          <Segmented<InfraShape>
            className="flex-1"
            value={node.data.shape ?? "square"}
            onChange={(shape) => setInfraShape(node.id, shape)}
            options={[
              { value: "square", label: "Square" },
              { value: "circle", label: "Circle" },
            ]}
          />
        </Row>
        {node.data.shape !== "circle" && (
        <SliderRow
          label="Radius"
          value={node.data.borderRadius ?? 12}
          min={0}
          max={48}
          onChange={(v) => updateNodeData(node.id, { borderRadius: v })}
        />
        )}
        <SliderRow
          label="Border"
          value={node.data.borderWidth ?? 1}
          min={0}
          max={8}
          onChange={(v) => updateNodeData(node.id, { borderWidth: v })}
        />
      </Section>
      <ColorsSection
        targets={[
          { key: "bg", label: "Background", value: node.data.bgColor, onChange: (v) => updateNodeData(node.id, { bgColor: v }) },
          { key: "icon", label: "Icon", value: node.data.iconColor, onChange: (v) => updateNodeData(node.id, { iconColor: v }) },
          { key: "title", label: "Title", value: node.data.titleColor, onChange: (v) => updateNodeData(node.id, { titleColor: v }) },
          { key: "desc", label: "Info", value: node.data.subtitleColor, onChange: (v) => updateNodeData(node.id, { subtitleColor: v }) },
          { key: "border", label: "Border", value: node.data.borderColor, onChange: (v) => updateNodeData(node.id, { borderColor: v }) },
        ]}
      />
    </>
  );
}

const BORDER_STYLES: BorderStyle[] = ["solid", "dashed", "dotted"];

function ShapeEditor({ node }: { node: ShapeNode }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const isRectangle = node.data.shape === "rectangle";
  return (
    <>
      <Section>
        <Row label="Label">
          <FieldInput
            value={node.data.label ?? ""}
            onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            placeholder="Optional"
          />
        </Row>
        <AccentRow
          value={node.data.accent ?? "slate"}
          onChange={(a) => updateNodeData(node.id, { accent: a })}
        />
      </Section>
      <Section title="Style">
        {isRectangle && (
          <Row label="Border">
            <Segmented
              className="flex-1"
              value={node.data.borderStyle ?? "dashed"}
              onChange={(v) => updateNodeData(node.id, { borderStyle: v })}
              options={BORDER_STYLES.map((k) => ({
                value: k,
                label: k[0].toUpperCase() + k.slice(1),
              }))}
            />
          </Row>
        )}
        {isRectangle && (
          <SliderRow
            label="Radius"
            value={node.data.borderRadius ?? 12}
            min={0}
            max={48}
            onChange={(v) => updateNodeData(node.id, { borderRadius: v })}
          />
        )}
      </Section>
      <ColorsSection
        targets={[
          { key: "bg", label: "Background", value: node.data.bgColor, onChange: (v) => updateNodeData(node.id, { bgColor: v }) },
          { key: "label", label: "Label", value: node.data.titleColor, onChange: (v) => updateNodeData(node.id, { titleColor: v }) },
          { key: "border", label: "Border", value: node.data.borderColor, onChange: (v) => updateNodeData(node.id, { borderColor: v }) },
        ]}
      />
    </>
  );
}

function StepEditor({ node }: { node: StepNode }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  return (
    <>
      <Section>
        <Row label="Number">
          <FieldInput
            type="number"
            value={node.data.step}
            onChange={(e) =>
              updateNodeData(node.id, {
                step: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </Row>
        <AccentRow
          value={node.data.accent ?? "indigo"}
          onChange={(a) => updateNodeData(node.id, { accent: a })}
        />
      </Section>
      <Section title="Style">
        <SliderRow
          label="Radius"
          value={node.data.borderRadius ?? 28}
          min={0}
          max={48}
          onChange={(borderRadius) =>
            updateNodeData(node.id, { borderRadius })
          }
        />
      </Section>
      <ColorsSection
        targets={[
          { key: "bg", label: "Background", value: node.data.bgColor, onChange: (v) => updateNodeData(node.id, { bgColor: v }) },
          { key: "number", label: "Number", value: node.data.titleColor, onChange: (v) => updateNodeData(node.id, { titleColor: v }) },
          { key: "border", label: "Border", value: node.data.borderColor, onChange: (v) => updateNodeData(node.id, { borderColor: v }) },
        ]}
      />
    </>
  );
}

function TextEditor({ node }: { node: TextNode }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  return (
    <>
      <Section>
        <textarea
          value={node.data.text}
          onChange={(e) => updateNodeData(node.id, { text: e.target.value })}
          rows={3}
          className="flex w-full rounded-lg bg-input px-2.5 py-2 text-xs placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Text content"
        />
        <SliderRow
          label="Size"
          value={node.data.fontSize ?? 14}
          min={10}
          max={64}
          onChange={(v) => updateNodeData(node.id, { fontSize: v })}
        />
        <AccentRow
          value={node.data.accent ?? "slate"}
          onChange={(a) => updateNodeData(node.id, { accent: a })}
        />
      </Section>
      <Section title="Style">
        <Row label="Fill">
          <Segmented
            className="flex-1"
            value={node.data.bgColor !== "transparent" ? "on" : "off"}
            onChange={(v) =>
              updateNodeData(node.id, {
                bgColor: v === "on" ? undefined : "transparent",
              })
            }
            options={[
              { value: "on", label: "Yes" },
              { value: "off", label: "No" },
            ]}
          />
        </Row>
        <SliderRow
          label="Radius"
          value={node.data.borderRadius ?? 6}
          min={0}
          max={48}
          onChange={(v) => updateNodeData(node.id, { borderRadius: v })}
        />
      </Section>
      <ColorsSection
        targets={[
          { key: "bg", label: "Background", value: node.data.bgColor, onChange: (v) => updateNodeData(node.id, { bgColor: v }) },
          { key: "text", label: "Text", value: node.data.titleColor, onChange: (v) => updateNodeData(node.id, { titleColor: v }) },
        ]}
      />
    </>
  );
}

function CodeEditor({ node }: { node: CodeNode }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  return (
    <>
      <Section>
        <Row label="Title">
          <FieldInput
            value={node.data.label ?? ""}
            onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            placeholder="Optional"
          />
        </Row>
        <Row label="Language">
          <select
            value={node.data.language}
            onChange={(e) =>
              updateNodeData(node.id, {
                language: e.target.value as CodeLanguage,
              })
            }
            className="h-7 w-full flex-1 rounded-lg bg-input px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Language"
          >
            {CODE_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Row>
        <textarea
          value={node.data.code}
          onChange={(e) => updateNodeData(node.id, { code: e.target.value })}
          spellCheck={false}
          className="flex min-h-[160px] w-full rounded-lg bg-input px-2.5 py-2 font-mono text-xs leading-relaxed placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Code"
        />
      </Section>
      <Section title="Style">
        <SliderRow
          label="Radius"
          value={node.data.borderRadius ?? 8}
          min={0}
          max={48}
          onChange={(v) => updateNodeData(node.id, { borderRadius: v })}
        />
      </Section>
      <ColorsSection
        targets={[
          { key: "bg", label: "Background", value: node.data.bgColor, onChange: (v) => updateNodeData(node.id, { bgColor: v }) },
          { key: "title", label: "Title", value: node.data.titleColor, onChange: (v) => updateNodeData(node.id, { titleColor: v }) },
          { key: "border", label: "Border", value: node.data.borderColor, onChange: (v) => updateNodeData(node.id, { borderColor: v }) },
        ]}
      />
    </>
  );
}

type ImageFit = NonNullable<ImageNode["data"]["fit"]>;

const IMAGE_FITS: { value: ImageFit; label: string }[] = [
  { value: "contain", label: "Fit" },
  { value: "cover", label: "Fill" },
  { value: "fill", label: "Stretch" },
];

function ImageFitControl({
  value,
  onChange,
}: {
  value: ImageFit;
  onChange: (value: ImageFit) => void;
}) {
  const current = IMAGE_FITS.find((option) => option.value === value);
  return (
    <PopoverControl
      aria-label="Image fit"
      panelWidth={160}
      trigger={<span className="truncate">{current?.label ?? "Fit"}</span>}
    >
      {(close) => (
        <div className="flex flex-col gap-0.5">
          {IMAGE_FITS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                close();
              }}
              className={cn(
                "rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                option.value === value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </PopoverControl>
  );
}

function ImageEditor({ node }: { node: ImageNode }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const fileRef = useRef<HTMLInputElement>(null);

  const replaceImage = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => updateNodeData(node.id, { src: String(reader.result) });
    reader.readAsDataURL(file);
  };

  return (
    <>
      <Section title="Image">
        <Row label="Source">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-input px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Upload className="h-3.5 w-3.5" />
            Replace image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) replaceImage(file);
              event.target.value = "";
            }}
          />
        </Row>
        <Row label="Fit">
          <ImageFitControl
            value={node.data.fit ?? "contain"}
            onChange={(fit) => updateNodeData(node.id, { fit })}
          />
        </Row>
        <SliderRow
          label="Scale"
          value={node.data.scale ?? 100}
          min={25}
          max={300}
          onChange={(scale) => updateNodeData(node.id, { scale })}
        />
        <SliderRow
          label="Opacity"
          value={node.data.opacity ?? 100}
          min={0}
          max={100}
          onChange={(opacity) => updateNodeData(node.id, { opacity })}
        />
      </Section>
      <Section title="Border">
        <Row label="Style">
          <Segmented
            className="flex-1"
            value={node.data.borderStyle ?? "solid"}
            onChange={(borderStyle) =>
              updateNodeData(node.id, { borderStyle })
            }
            options={BORDER_STYLES.map((style) => ({
              value: style,
              label: style[0].toUpperCase() + style.slice(1),
            }))}
          />
        </Row>
        <SliderRow
          label="Border width"
          value={node.data.borderWidth ?? 1}
          min={0}
          max={12}
          onChange={(borderWidth) =>
            updateNodeData(node.id, { borderWidth })
          }
        />
        <SliderRow
          label="Radius"
          value={node.data.borderRadius ?? 8}
          min={0}
          max={48}
          onChange={(v) => updateNodeData(node.id, { borderRadius: v })}
        />
      </Section>
      <ColorsSection
        targets={[
          { key: "bg", label: "Background", value: node.data.bgColor, onChange: (v) => updateNodeData(node.id, { bgColor: v }) },
          { key: "border", label: "Border", value: node.data.borderColor, onChange: (v) => updateNodeData(node.id, { borderColor: v }) },
        ]}
      />
    </>
  );
}

const ARROW_SHAPES: { id: ArrowShape; label: string; svg: React.ReactNode }[] = [
  { id: "none", label: "None", svg: <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.5" /> },
  { id: "triangle", label: "Triangle", svg: <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /> },
  { id: "open", label: "Open", svg: <path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> },
  { id: "diamond", label: "Diamond", svg: <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="currentColor" /> },
  { id: "circle", label: "Circle", svg: <circle cx="5" cy="5" r="3.5" fill="currentColor" /> },
];

function ArrowShapeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ArrowShape;
  onChange: (v: ArrowShape) => void;
}) {
  return (
    <Row label={label}>
      <div className="flex flex-wrap gap-1">
        {ARROW_SHAPES.map((s) => {
          const active = value === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              title={s.label}
              aria-label={s.label}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <svg viewBox="0 0 10 10" className="h-3.5 w-3.5">
                {s.svg}
              </svg>
            </button>
          );
        })}
      </div>
    </Row>
  );
}

const LINE_STROKE_PRESETS: { id: string; hex: string | null; label: string }[] = [
  { id: "default", hex: "#94a3b8", label: "Default" },
  { id: "white", hex: "#ffffff", label: "White" },
  { id: "black", hex: "#0f172a", label: "Black" },
  { id: "red", hex: "#ef4444", label: "Red" },
  { id: "orange", hex: "#f97316", label: "Orange" },
  { id: "amber", hex: "#f59e0b", label: "Amber" },
  { id: "yellow", hex: "#eab308", label: "Yellow" },
  { id: "lime", hex: "#65a30d", label: "Lime" },
  { id: "emerald", hex: "#10b981", label: "Emerald" },
  { id: "teal", hex: "#14b8a6", label: "Teal" },
  { id: "cyan", hex: "#06b6d4", label: "Cyan" },
  { id: "sky", hex: "#0ea5e9", label: "Sky" },
  { id: "blue", hex: "#3b82f6", label: "Blue" },
  { id: "indigo", hex: "#6366f1", label: "Indigo" },
  { id: "violet", hex: "#8b5cf6", label: "Violet" },
  { id: "fuchsia", hex: "#d946ef", label: "Fuchsia" },
  { id: "pink", hex: "#ec4899", label: "Pink" },
];

function LineEditor({ node }: { node: LineNode }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const updateLineGeometry = useFlowStore((s) => s.updateLineGeometry);
  const width =
    node.measured?.width ??
    (typeof node.width === "number" ? node.width : undefined) ??
    (typeof node.style?.width === "number" ? node.style.width : undefined) ??
    200;
  const height =
    node.measured?.height ??
    (typeof node.height === "number" ? node.height : undefined) ??
    (typeof node.style?.height === "number" ? node.style.height : undefined) ??
    60;
  const endpoints =
    node.data.start && node.data.end
      ? { start: node.data.start, end: node.data.end }
      : deriveLegacyLineEndpoints(
          node.data.direction,
          width,
          height,
          node.data.rotation ?? 0
        );
  const rotation = lineAngleDegrees(endpoints.start, endpoints.end);
  const rotationDisabled = Boolean(
    node.data.startBinding || node.data.endBinding
  );
  const curvature = node.data.curvature ?? 0;
  const strokeColor = node.data.strokeColor ?? "#94a3b8";
  const strokeWidth = node.data.strokeWidth ?? 2;
  const dashed = !!node.data.dashed;
  const arrowStart = !!node.data.arrowStart;
  const arrowEnd = !!node.data.arrowEnd;
  const arrowStartShape: ArrowShape = node.data.arrowStartShape ?? "triangle";
  const arrowEndShape: ArrowShape = node.data.arrowEndShape ?? "triangle";

  const rotate = (angle: number) => {
    if (rotationDisabled) return;
    // The projected node has a neutralized position; read live.
    const live = useFlowStore.getState().nodes.find((n) => n.id === node.id);
    const geometry = rotateLineToAngle({
      position: live?.position ?? node.position,
      width,
      height,
      start: endpoints.start,
      end: endpoints.end,
      angle,
    });
    updateLineGeometry(node.id, geometry);
  };

  return (
    <>
      <Section>
        <SliderRow
          label="Rotate"
          value={rotation}
          min={0}
          max={359}
          onChange={rotate}
          disabled={rotationDisabled}
        />
        <SliderRow
          label="Curve"
          value={curvature}
          min={-1}
          max={1}
          step={0.05}
          onChange={(v) => updateNodeData(node.id, { curvature: v })}
          format={(v) => v.toFixed(2)}
        />
        <Row label="Style">
          <Segmented
            className="flex-1"
            value={dashed ? "dashed" : "solid"}
            onChange={(v) =>
              updateNodeData(node.id, { dashed: v === "dashed" })
            }
            options={[
              { value: "solid", label: "Solid" },
              { value: "dashed", label: "Dashed" },
            ]}
          />
        </Row>
        <SliderRow
          label="Width"
          value={strokeWidth}
          min={1}
          max={12}
          onChange={(v) => updateNodeData(node.id, { strokeWidth: v })}
        />
      </Section>
      <Section title="Arrows">
        <Row label="Ends">
          <button
            type="button"
            onClick={() =>
              updateNodeData(node.id, { arrowStart: !arrowStart })
            }
            className={cn(
              "h-7 flex-1 rounded-md text-xs font-medium transition-colors",
              arrowStart
                ? "bg-accent text-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => updateNodeData(node.id, { arrowEnd: !arrowEnd })}
            className={cn(
              "h-7 flex-1 rounded-md text-xs font-medium transition-colors",
              arrowEnd
                ? "bg-accent text-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            End
          </button>
        </Row>
        {arrowStart && (
          <ArrowShapeRow
            label="Start"
            value={arrowStartShape}
            onChange={(v) => updateNodeData(node.id, { arrowStartShape: v })}
          />
        )}
        {arrowEnd && (
          <ArrowShapeRow
            label="End"
            value={arrowEndShape}
            onChange={(v) => updateNodeData(node.id, { arrowEndShape: v })}
          />
        )}
      </Section>
      <Section title="Stroke">
        <Row label="Color">
          <ColorControl
            value={strokeColor}
            presets={LINE_STROKE_PRESETS}
            onChange={(v) =>
              updateNodeData(node.id, { strokeColor: v ?? "#94a3b8" })
            }
          />
        </Row>
      </Section>
    </>
  );
}
