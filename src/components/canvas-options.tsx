import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, X } from "@/ui/icons";
import {
  useFlowStore,
  type EdgeCurveStyle,
  type EdgeLineStyle,
} from "@/store/flow-store";
import { COLOR_PRESETS } from "@/blocks/registry";
import { Slider } from "@/ui/slider";
import { cn } from "@/lib/utils";

// Figma-style "Page" panel: the only control shown when nothing is
// selected — the work-area background color of the active page.
export function PageOptions() {
  const bgColor = useFlowStore(
    (s) => s.pages.find((p) => p.id === s.activePageId)?.bgColor
  );
  const setPageBackground = useFlowStore((s) => s.setPageBackground);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const themeDefault =
    mounted && resolvedTheme === "light" ? "#f9f9f9" : "#000000";
  const value = bgColor ?? themeDefault;
  // null = not editing; otherwise the in-progress hex text.
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const commitHex = () => {
    if (hexDraft === null) return;
    const v = hexDraft.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(v) || /^[0-9a-fA-F]{3}$/.test(v)) {
      setPageBackground(`#${v.toLowerCase()}`);
    }
    setHexDraft(null);
  };

  return (
    <div className="px-4 pt-1">
      <div className="flex items-center gap-2 rounded-lg bg-muted p-1.5 pr-1">
        <label
          className="relative block h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded border border-foreground/20"
          style={{ backgroundColor: value }}
          title="Page background color"
        >
          <input
            type="color"
            value={value}
            onChange={(e) => setPageBackground(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Page background color"
          />
        </label>
        <input
          value={hexDraft ?? value.replace("#", "").toUpperCase()}
          onFocus={() => setHexDraft(value.replace("#", "").toUpperCase())}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitHex();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setHexDraft(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-xs uppercase tabular-nums text-foreground outline-none placeholder:text-muted-foreground/50"
          aria-label="Page background hex value"
        />
        {bgColor && (
          <button
            type="button"
            onClick={() => setPageBackground(undefined)}
            className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Reset to theme default"
            aria-label="Reset page background"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

export function CanvasOptions() {
  const setEdgeColor = useFlowStore((s) => s.setEdgeColor);
  const setEdgeCurveStyle = useFlowStore((s) => s.setEdgeCurveStyle);
  const setEdgeLineStyle = useFlowStore((s) => s.setEdgeLineStyle);
  const setEdgeDashGap = useFlowStore((s) => s.setEdgeDashGap);
  const setEdgeLabelColor = useFlowStore((s) => s.setEdgeLabelColor);
  const labelTextColor = useFlowStore((s) => {
    const selected = s.edges.filter((edge) => edge.selected);
    if (selected.length === 0) return undefined;
    const first = selected[0].data?.labelTextColor;
    return selected.every((edge) => edge.data?.labelTextColor === first)
      ? first
      : undefined;
  });
  const labelBgColor = useFlowStore((s) => {
    const selected = s.edges.filter((edge) => edge.selected);
    if (selected.length === 0) return undefined;
    const first = selected[0].data?.labelBgColor;
    return selected.every((edge) => edge.data?.labelBgColor === first)
      ? first
      : undefined;
  });
  const labelBorderColor = useFlowStore((s) => {
    const selected = s.edges.filter((edge) => edge.selected);
    if (selected.length === 0) return undefined;
    const first = selected[0].data?.labelBorderColor;
    return selected.every((edge) => edge.data?.labelBorderColor === first)
      ? first
      : undefined;
  });
  const [labelKey, setLabelKey] = useState<LabelColorKey>("text");
  const labelColors: Record<LabelColorKey, string | undefined> = {
    text: labelTextColor,
    bg: labelBgColor,
    border: labelBorderColor,
  };
  const edgeDashGap = useFlowStore((s) => {
    const selected = s.edges.filter((edge) => edge.selected);
    if (selected.length === 0) return s.edgeDashGap;
    const first = selected[0].data?.dashGap ?? s.edgeDashGap;
    return selected.every(
      (edge) => (edge.data?.dashGap ?? s.edgeDashGap) === first
    )
      ? first
      : s.edgeDashGap;
  });
  const edgeColor = useFlowStore((s) => {
    const selected = s.edges.filter((edge) => edge.selected);
    if (selected.length === 0) return s.edgeColor;
    const first = selected[0].data?.color;
    return selected.every((edge) => edge.data?.color === first)
      ? first
      : undefined;
  });
  const edgeLineStyle = useFlowStore((s) => {
    const selected = s.edges.filter((edge) => edge.selected);
    if (selected.length === 0) return s.edgeLineStyle;
    const first = selected[0].data?.lineStyle ?? "solid";
    return selected.every(
      (edge) => (edge.data?.lineStyle ?? "solid") === first
    )
      ? first
      : undefined;
  });
  const edgeCurveStyle = useFlowStore((s) => {
    const selected = s.edges.filter((edge) => edge.selected);
    if (selected.length === 0) return s.edgeCurveStyle;
    const first = selected[0].data?.curveStyle ?? "stepped";
    return selected.every(
      (edge) => (edge.data?.curveStyle ?? "stepped") === first
    )
      ? first
      : undefined;
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <InspectorSection title="Appearance">
        <InspectorRow label="Color">
          <PaletteControl
            value={edgeColor}
            includeTransparent={false}
            onChange={setEdgeColor}
          />
        </InspectorRow>
        <InspectorRow label="Style">
          <div className="grid h-7 min-w-0 flex-1 grid-cols-3 rounded-md bg-input p-0.5">
            {(["solid", "dashed", "dotted"] as EdgeLineStyle[]).map(
              (style) => (
                <button
                  key={style}
                  type="button"
                  aria-label={`${style} edge line`}
                  aria-pressed={edgeLineStyle === style}
                  title={style[0].toUpperCase() + style.slice(1)}
                  onClick={() => setEdgeLineStyle(style)}
                  className={cn(
                    "flex min-w-0 items-center rounded-[5px] px-1.5 transition-colors",
                    edgeLineStyle === style
                      ? "bg-accent text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LineStylePreview kind={style} />
                </button>
              )
            )}
          </div>
        </InspectorRow>
        {(edgeLineStyle === "dashed" || edgeLineStyle === "dotted") && (
          <InspectorRow label="Spacing">
            <Slider
              min={2}
              max={20}
              step={1}
              value={edgeDashGap}
              onChange={(event) => setEdgeDashGap(Number(event.target.value))}
              className="min-w-0 flex-1"
              aria-label="Edge dash spacing"
            />
            <span className="flex h-7 w-10 shrink-0 items-center justify-end rounded-md bg-input px-1.5 text-[11px] tabular-nums text-foreground">
              {edgeDashGap}
            </span>
          </InspectorRow>
        )}
        <InspectorRow label="Curve">
          <div className="grid min-w-0 flex-1 grid-cols-2 rounded-md bg-input p-0.5">
            {(["stepped", "smooth"] as EdgeCurveStyle[]).map((style) => {
              const label = style === "stepped" ? "Stepped" : "Smooth";
              return (
                <button
                  key={style}
                  type="button"
                  aria-label={`${label} edge curve`}
                  aria-pressed={edgeCurveStyle === style}
                  onClick={() => setEdgeCurveStyle(style)}
                  className={cn(
                    "flex min-w-0 flex-col items-center rounded-[5px] px-1.5 py-1 text-[10px] font-medium leading-none transition-colors",
                    edgeCurveStyle === style
                      ? "bg-accent text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <EdgeCurvePreview style={style} />
                  <span className="pt-1">{label}</span>
                </button>
              );
            })}
          </div>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection title="Label">
        <InspectorRow label="Target">
          <div className="grid h-7 min-w-0 flex-1 grid-cols-3 rounded-md bg-input p-0.5">
            {LABEL_TARGETS.map((target) => (
              <button
                key={target.key}
                type="button"
                aria-pressed={labelKey === target.key}
                onClick={() => setLabelKey(target.key)}
                className={cn(
                  "truncate rounded-[5px] px-1 text-[10px] font-medium transition-colors",
                  labelKey === target.key
                    ? "bg-accent text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {target.label}
              </button>
            ))}
          </div>
        </InspectorRow>
        <InspectorRow label="Color">
          <PaletteControl
            value={labelColors[labelKey]}
            includeTransparent
            dropUp
            onChange={(value) => setEdgeLabelColor(labelKey, value)}
          />
        </InspectorRow>
      </InspectorSection>
    </div>
  );
}

type LabelColorKey = "text" | "bg" | "border";

const LABEL_TARGETS: { key: LabelColorKey; label: string }[] = [
  { key: "text", label: "Text" },
  { key: "bg", label: "Fill" },
  { key: "border", label: "Border" },
];

const TRANSPARENT_BACKGROUND =
  "conic-gradient(hsl(var(--muted-foreground) / 0.45) 25%, transparent 25% 50%, hsl(var(--muted-foreground) / 0.45) 50% 75%, transparent 75%)";

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-4 py-3.5 last:border-b-0">
      <p className="pb-2.5 text-xs font-semibold text-foreground">{title}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function InspectorRow({
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

function PaletteControl({
  value,
  includeTransparent,
  dropUp = false,
  onChange,
}: {
  value: string | undefined;
  includeTransparent: boolean;
  dropUp?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedPreset = COLOR_PRESETS.find((preset) => preset.hex === value);
  const presets = COLOR_PRESETS.filter(
    (preset) => includeTransparent || preset.hex !== "transparent"
  );

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const pick = (next: string | null) => {
    onChange(next ?? undefined);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label="Choose color"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md bg-input px-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted",
          open && "ring-1 ring-ring"
        )}
      >
        <ColorSwatch value={value} />
        <span className="truncate tabular-nums">
          {selectedPreset?.label ??
            value?.replace("#", "").toUpperCase() ??
            "Default"}
        </span>
        <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute right-0 z-30 w-[240px] rounded-xl border border-border/60 bg-popover p-2 shadow-xl",
            dropUp ? "bottom-8" : "top-8"
          )}
        >
          <div className="grid grid-cols-8 gap-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                onClick={() => pick(preset.hex)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-[5px] ring-1 ring-inset ring-foreground/10 transition-transform hover:scale-110",
                  preset.hex === null && "bg-muted",
                  (value ?? null) === preset.hex && "ring-2 ring-inset ring-ring"
                )}
                style={colorStyle(preset.hex)}
              >
                {preset.hex === null ? (
                  <X className="h-3 w-3 text-muted-foreground" />
                ) : null}
              </button>
            ))}
          </div>
          <label className="mt-2 flex h-7 cursor-pointer items-center gap-2 rounded-md bg-input px-1.5 text-xs text-muted-foreground hover:text-foreground">
            <span
              className="h-4 w-4 rounded border border-foreground/15"
              style={{
                backgroundColor:
                  value && value !== "transparent" ? value : "#64748b",
              }}
            />
            Custom color
            <input
              type="color"
              value={value && value !== "transparent" ? value : "#64748b"}
              onChange={(event) => pick(event.target.value)}
              className="sr-only"
              aria-label="Custom edge color"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function ColorSwatch({ value }: { value: string | undefined }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-foreground/15",
        value === undefined && "bg-muted"
      )}
      style={colorStyle(value)}
    >
      {value === undefined ? (
        <X className="h-2.5 w-2.5 text-muted-foreground" />
      ) : null}
    </span>
  );
}

function colorStyle(value: string | null | undefined): React.CSSProperties {
  if (value === "transparent") {
    return {
      backgroundImage: TRANSPARENT_BACKGROUND,
      backgroundSize: "6px 6px",
    };
  }
  return value ? { backgroundColor: value } : {};
}

function LineStylePreview({ kind }: { kind: EdgeLineStyle }) {
  const dash =
    kind === "dashed" ? "6 4" : kind === "dotted" ? "1 4" : undefined;
  return (
    <svg viewBox="0 0 40 6" className="h-1.5 w-full">
      <line
        x1="2"
        y1="3"
        x2="38"
        y2="3"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={dash}
        strokeLinecap={kind === "dotted" ? "round" : undefined}
      />
    </svg>
  );
}

function EdgeCurvePreview({ style }: { style: EdgeCurveStyle }) {
  const path =
    style === "smooth"
      ? "M2 2C16 2 24 10 38 10"
      : "M2 2H16Q20 2 20 6V10H38";
  return (
    <svg viewBox="0 0 40 12" className="h-3 w-full">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
