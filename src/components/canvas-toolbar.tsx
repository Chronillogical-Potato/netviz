import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Circle,
  Hand,
  Pointer,
  Shapes,
  Square,
  Type,
} from "@/ui/icons";
import { useReactFlow } from "@xyflow/react";
import { BlocksFlyout } from "./blocks-flyout";
import { cn } from "@/lib/utils";

export type CanvasTool =
  | "select"
  | "hand"
  | "rect"
  | "circle"
  | "line"
  | "text";

const TOOLS: {
  id: CanvasTool;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}[] = [
  { id: "select", icon: Pointer, title: "Select (V)" },
  { id: "hand", icon: Hand, title: "Hand (H)" },
  { id: "rect", icon: Square, title: "Rectangle (R)" },
  { id: "circle", icon: Circle, title: "Circle (O)" },
  { id: "line", icon: ArrowRight, title: "Line (L)" },
  { id: "text", icon: Type, title: "Text (T)" },
];

const TOOL_KEYS: Record<string, CanvasTool> = {
  v: "select",
  h: "hand",
  r: "rect",
  o: "circle",
  l: "line",
  t: "text",
};

export function CanvasToolbar({
  tool,
  onToolChange,
}: {
  tool: CanvasTool;
  onToolChange: (t: CanvasTool) => void;
}) {
  const [blocksOpen, setBlocksOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { fitView, zoomTo } = useReactFlow();

  useEffect(() => {
    if (!blocksOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setBlocksOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBlocksOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [blocksOpen]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.code === "Digit0") {
        e.preventDefault();
        zoomTo(1, { duration: 200 });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.shiftKey && e.code === "Digit1") {
        e.preventDefault();
        fitView({ padding: 0.4, duration: 200 });
        return;
      }
      const k = e.key.toLowerCase();
      if (TOOL_KEYS[k]) onToolChange(TOOL_KEYS[k]);
      else if (k === "b") setBlocksOpen((o) => !o);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onToolChange, fitView, zoomTo]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2"
    >
      {blocksOpen && (
        <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2">
          <BlocksFlyout onAdded={() => setBlocksOpen(false)} />
        </div>
      )}
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border/60 bg-popover p-1 shadow-xl">
        {TOOLS.map((t) => {
          const Ic = t.icon;
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onToolChange(t.id)}
              title={t.title}
              aria-label={t.title}
              aria-pressed={active}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Ic className="h-4 w-4" />
            </button>
          );
        })}
        <div className="mx-1 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => setBlocksOpen((o) => !o)}
          title="Blocks (B)"
          aria-label="Blocks (B)"
          aria-pressed={blocksOpen}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            blocksOpen
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Shapes className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
