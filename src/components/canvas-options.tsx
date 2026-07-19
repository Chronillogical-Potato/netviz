import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { Check, ChevronDown, X } from "@/ui/icons";
import {
  useFlowStore,
  type EdgeCurveStyle,
  type EdgeLineStyle,
} from "@/store/flow-store";
import { COLOR_PRESETS } from "@/blocks/registry";
import { Input } from "@/ui/input";
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
  const setEdgeLabel = useFlowStore((s) => s.setEdgeLabel);
  const setEdgeLabelColor = useFlowStore((s) => s.setEdgeLabelColor);
  const edgeLabel = useFlowStore((s) => {
    const selected = s.edges.filter((edge) => edge.selected);
    if (selected.length === 0) return "";
    const first = selected[0].data?.label ?? "";
    return selected.every((edge) => (edge.data?.label ?? "") === first)
      ? first
      : undefined;
  });
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
          <DropdownControl
            label="Edge style"
            value={edgeLineStyle}
            options={EDGE_LINE_OPTIONS}
            onChange={setEdgeLineStyle}
            renderPreview={(style) => (
              <span className="w-10 shrink-0">
                <LineStylePreview kind={style} />
              </span>
            )}
          />
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
          <DropdownControl
            label="Edge curve"
            value={edgeCurveStyle}
            options={EDGE_CURVE_OPTIONS}
            onChange={setEdgeCurveStyle}
            renderPreview={(style) => (
              <span className="w-10 shrink-0">
                <EdgeCurvePreview style={style} />
              </span>
            )}
          />
        </InspectorRow>
      </InspectorSection>

      <InspectorSection title="Label">
        <InspectorRow label="Text">
          <Input
            value={edgeLabel ?? ""}
            placeholder={edgeLabel === undefined ? "Mixed" : "Label"}
            onChange={(event) => setEdgeLabel(event.target.value)}
            aria-label="Edge label"
            className="h-7 min-w-0 flex-1 rounded-md px-2 text-xs"
          />
        </InspectorRow>
        <InspectorRow label="Text color">
          <PaletteControl
            label="Text color"
            value={labelTextColor}
            includeTransparent
            onChange={(value) => setEdgeLabelColor("text", value)}
          />
        </InspectorRow>
        <InspectorRow label="Background">
          <PaletteControl
            label="Background color"
            value={labelBgColor}
            includeTransparent
            onChange={(value) => setEdgeLabelColor("bg", value)}
          />
        </InspectorRow>
        <InspectorRow label="Border">
          <PaletteControl
            label="Border color"
            value={labelBorderColor}
            includeTransparent
            dropUp
            onChange={(value) => setEdgeLabelColor("border", value)}
          />
        </InspectorRow>
      </InspectorSection>
    </div>
  );
}

const EDGE_LINE_OPTIONS: Array<{
  value: EdgeLineStyle;
  label: string;
}> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const EDGE_CURVE_OPTIONS: Array<{
  value: EdgeCurveStyle;
  label: string;
}> = [
  { value: "stepped", label: "Stepped" },
  { value: "smooth", label: "Smooth" },
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

function DropdownControl<T extends string>({
  label,
  value,
  options,
  onChange,
  renderPreview,
}: {
  label: string;
  value: T | undefined;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  renderPreview: (value: T) => ReactNode;
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
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOnScroll = () => setOpen(false);
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(176, rect.width);
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - width - 8)
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    setPosition(
      spaceBelow < 150
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
        onClick={toggle}
        className={cn(
          "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-input px-2 text-left text-xs text-foreground transition-colors hover:bg-muted",
          open && "ring-1 ring-ring"
        )}
      >
        {value ? renderPreview(value) : null}
        <span className="truncate">{selected?.label ?? "Mixed"}</span>
        <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={`${label} options`}
            className="fixed z-50 rounded-xl border border-border/60 bg-popover p-1.5 shadow-xl"
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
                  "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors hover:bg-muted",
                  option.value === value
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span className="w-10 shrink-0">
                  {renderPreview(option.value)}
                </span>
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

function PaletteControl({
  label = "Choose color",
  value,
  includeTransparent,
  dropUp = false,
  onChange,
}: {
  label?: string;
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
        aria-label={label}
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
