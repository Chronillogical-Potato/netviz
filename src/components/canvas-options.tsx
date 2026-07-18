import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sparkles, X } from "@/ui/icons";
import type { AppIcon } from "@/ui/icons";
import { useFlowStore, type EdgeLineStyle } from "@/store/flow-store";
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
  const turboColors = useFlowStore((s) => s.turboColors);
  const toggleTurbo = useFlowStore((s) => s.toggleTurbo);
  const setTurboColor = useFlowStore((s) => s.setTurboColor);
  const setEdgeColor = useFlowStore((s) => s.setEdgeColor);
  const setEdgeLineStyle = useFlowStore((s) => s.setEdgeLineStyle);
  const setEdgeDashGap = useFlowStore((s) => s.setEdgeDashGap);
  const setEdgeLabelColor = useFlowStore((s) => s.setEdgeLabelColor);
  const labelTextColor = useFlowStore((s) => {
    const sel = s.edges.filter((e) => e.selected);
    if (sel.length === 0) return undefined;
    const first = sel[0].data?.labelTextColor;
    return sel.every((e) => e.data?.labelTextColor === first) ? first : undefined;
  });
  const labelBgColor = useFlowStore((s) => {
    const sel = s.edges.filter((e) => e.selected);
    if (sel.length === 0) return undefined;
    const first = sel[0].data?.labelBgColor;
    return sel.every((e) => e.data?.labelBgColor === first) ? first : undefined;
  });
  const labelBorderColor = useFlowStore((s) => {
    const sel = s.edges.filter((e) => e.selected);
    if (sel.length === 0) return undefined;
    const first = sel[0].data?.labelBorderColor;
    return sel.every((e) => e.data?.labelBorderColor === first)
      ? first
      : undefined;
  });
  const labelColors = {
    text: labelTextColor,
    bg: labelBgColor,
    border: labelBorderColor,
  };
  const [labelKey, setLabelKey] = useState<"text" | "bg" | "border">("text");
  const edgeDashGap = useFlowStore((s) => {
    const sel = s.edges.filter((e) => e.selected);
    if (sel.length === 0) return s.edgeDashGap;
    const first = sel[0].data?.dashGap ?? s.edgeDashGap;
    return sel.every((e) => (e.data?.dashGap ?? s.edgeDashGap) === first)
      ? first
      : s.edgeDashGap;
  });
  const edgeColor = useFlowStore((s) => {
    const sel = s.edges.filter((e) => e.selected);
    if (sel.length === 0) return s.edgeColor;
    const first = sel[0].data?.color;
    return sel.every((e) => e.data?.color === first) ? first : undefined;
  });
  const edgeLineStyle = useFlowStore((s) => {
    const sel = s.edges.filter((e) => e.selected);
    if (sel.length === 0) return s.edgeLineStyle;
    const first = sel[0].data?.lineStyle ?? "solid";
    return sel.every((e) => (e.data?.lineStyle ?? "solid") === first)
      ? first
      : undefined;
  });
  const turboActive = useFlowStore((s) => {
    const edgeSel = s.edges.filter((e) => e.selected);
    const nodeSel = s.nodes.filter((n) => n.selected);
    if (edgeSel.length + nodeSel.length === 0) return s.turbo;
    return (
      edgeSel.every((e) => e.data?.turbo) &&
      nodeSel.every((n) => (n.data as { turbo?: boolean }).turbo)
    );
  });
  return (
    <div className="flex-1 overflow-y-auto px-3 pb-3">
      <p className="px-2 pb-2 pt-3 text-xs font-semibold text-foreground">
        Edges
      </p>
      <div className="flex flex-col gap-1.5">
        <div
          className={cn(
            "px-2 pt-2",
            turboActive && "pointer-events-none opacity-40"
          )}
          title={turboActive ? "Turbo overrides edge color" : undefined}
        >
          <p className="pb-1.5 text-[11px] font-medium text-muted-foreground">
            Color{turboActive ? " (overridden by turbo)" : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.filter((p) => p.hex !== "transparent").map((p) => {
              const selected = (edgeColor ?? null) === p.hex;
              const isNone = p.hex === null;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setEdgeColor(p.hex ?? undefined)}
                  title={p.label}
                  aria-label={p.label}
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-md transition-shadow",
                    isNone && "bg-muted",
                    selected && "ring-2 ring-ring ring-offset-1 ring-offset-background"
                  )}
                  style={
                    isNone ? undefined : { backgroundColor: p.hex ?? undefined }
                  }
                >
                  {isNone ? (
                    <X className="h-3 w-3 text-muted-foreground" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="px-2 pt-2">
          <p className="pb-1.5 text-[11px] font-medium text-muted-foreground">
            Line style
          </p>
          <div className="flex items-center rounded-lg bg-muted p-0.5">
            {(["solid", "dashed", "dotted"] as EdgeLineStyle[]).map((k) => {
              const active = edgeLineStyle === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setEdgeLineStyle(k)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-[11px] capitalize transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LineStylePreview kind={k} />
                  <span className="block pt-0.5">{k}</span>
                </button>
              );
            })}
          </div>
        </div>
        {(edgeLineStyle === "dashed" || edgeLineStyle === "dotted") && (
          <div className="flex items-center gap-2 px-2 pt-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              Spacing
            </span>
            <Slider
              min={2}
              max={20}
              step={1}
              value={edgeDashGap}
              onChange={(e) => setEdgeDashGap(Number(e.target.value))}
              className="min-w-0 flex-1"
              aria-label="Edge dash spacing"
            />
            <span className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">
              {edgeDashGap}
            </span>
          </div>
        )}
        <div className="px-2 pt-2">
          <p className="pb-1.5 text-[11px] font-medium text-muted-foreground">
            Label
          </p>
          <div className="flex flex-wrap gap-1 pb-1.5">
            {(
              [
                { k: "text", label: "Text" },
                { k: "bg", label: "Background" },
                { k: "border", label: "Border" },
              ] as { k: "text" | "bg" | "border"; label: string }[]
            ).map((t) => {
              const selected = labelKey === t.k;
              const val = labelColors[t.k];
              return (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setLabelKey(t.k)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors",
                    selected
                      ? "bg-accent text-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-border"
                    style={val ? { backgroundColor: val } : undefined}
                  />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map((p) => {
              const current = labelColors[labelKey] ?? null;
              const selected = (current ?? null) === p.hex;
              const isNone = p.hex === null;
              const isTransparent = p.hex === "transparent";
              const style: React.CSSProperties = {};
              if (isTransparent) {
                style.backgroundImage =
                  "conic-gradient(hsl(var(--muted-foreground) / 0.5) 25%, transparent 25% 50%, hsl(var(--muted-foreground) / 0.5) 50% 75%, transparent 75%)";
                style.backgroundSize = "6px 6px";
              } else if (!isNone) {
                style.backgroundColor = p.hex ?? undefined;
              }
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setEdgeLabelColor(labelKey, p.hex ?? undefined)
                  }
                  title={p.label}
                  aria-label={p.label}
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-md transition-shadow",
                    isNone && "bg-muted",
                    selected && "ring-2 ring-ring ring-offset-1 ring-offset-background"
                  )}
                  style={style}
                >
                  {isNone ? (
                    <X className="h-3 w-3 text-muted-foreground" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="px-2 pb-2 pt-5 text-xs font-semibold text-foreground">
        Blocks
      </p>
      <div className="flex flex-col gap-1.5">
        <ModeToggle
          icon={Sparkles}
          label="Turbo"
          active={turboActive}
          onToggle={toggleTurbo}
        />
      </div>
      {turboActive && (
        <>
          <p className="px-2 pb-2 pt-5 text-xs font-semibold text-foreground">
            Turbo colors
          </p>
          <div className="flex items-center gap-2 px-2">
            <ColorSwatch
              value={turboColors[0]}
              onChange={(v) => setTurboColor(0, v)}
              label="Turbo start color"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <ColorSwatch
              value={turboColors[1]}
              onChange={(v) => setTurboColor(1, v)}
              label="Turbo end color"
            />
          </div>
        </>
      )}
    </div>
  );
}

function LineStylePreview({ kind }: { kind: EdgeLineStyle }) {
  const dash =
    kind === "dashed" ? "6 4" : kind === "dotted" ? "1 4" : undefined;
  const cap = kind === "dotted" ? "round" : undefined;
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
        strokeLinecap={cap}
      />
    </svg>
  );
}

function ModeToggle({
  icon: Ic,
  label,
  active,
  onToggle,
}: {
  icon: AppIcon;
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-muted",
        active ? "text-foreground" : "text-muted-foreground"
      )}
    >
      <Ic className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">{label}</span>
      <span
        className={cn(
          "flex h-4 w-7 items-center rounded-full p-0.5 transition-colors",
          active ? "bg-primary" : "bg-accent"
        )}
      >
        <span
          className={cn(
            "h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
            active ? "translate-x-3" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}

function ColorSwatch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label
      className="relative block h-6 w-6 cursor-pointer overflow-hidden rounded-md ring-1 ring-inset ring-border"
      style={{ backgroundColor: value }}
      aria-label={label}
      title={label}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}
