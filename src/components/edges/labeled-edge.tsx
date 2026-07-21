import { useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { useFlowStore, type LabeledEdge as LabeledEdgeType } from "@/store/flow-store";
import { cn } from "@/lib/utils";
import { EdgeMotionLayer } from "./edge-motion-layer";

export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  markerStart,
  markerEnd,
  style,
  interactionWidth = 20,
}: EdgeProps<LabeledEdgeType>) {
  const pathArgs = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  };
  const [edgePath, labelX, labelY] =
    data?.curveStyle === "smooth"
      ? getBezierPath(pathArgs)
      : getSmoothStepPath({ ...pathArgs, borderRadius: 16 });
  const updateEdgeLabel = useFlowStore((s) => s.updateEdgeLabel);
  const workMode = useFlowStore((s) => s.workMode);
  const [editing, setEditing] = useState(false);
  const label = data?.label ?? "";
  const [draft, setDraft] = useState(label);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(label);
  }, [label]);
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== label) updateEdgeLabel(id, next);
  };

  const lineStyle = data?.lineStyle ?? "solid";
  const gap = data?.dashGap ?? 6;
  const dashOffset =
    lineStyle === "dashed"
      ? gap * 2
      : lineStyle === "dotted"
      ? 1 + Math.max(2, gap)
      : 12;
  const edgeStyle: React.CSSProperties = {
    ...(data?.color && !data?.turbo ? { stroke: data.color } : {}),
    ...(lineStyle === "dashed"
      ? { strokeDasharray: `${gap} ${gap}` }
      : lineStyle === "dotted"
      ? {
          strokeDasharray: `1 ${Math.max(2, gap)}`,
          strokeLinecap: "round" as const,
        }
      : {}),
    ["--dash-offset" as string]: dashOffset,
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={0}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={{ ...style, ...edgeStyle }}
        data-edge-layer="base"
        data-edge-id={id}
      />
      <EdgeMotionLayer
        edgeId={id}
        edgePath={edgePath}
        gradientVector={{
          x1: sourceX,
          y1: sourceY,
          x2: targetX,
          y2: targetY,
        }}
        motionState={
          workMode === "design"
            ? "stopped"
            : workMode === "preview" || workMode === "video"
              ? "playing"
              : "paused"
        }
      />
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={interactionWidth}
        className="react-flow__edge-interaction"
        data-edge-layer="interaction"
        data-edge-id={id}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          className="nodrag nopan pointer-events-auto absolute"
        >
          {editing ? (
            <input
              ref={ref}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(label);
                  setEditing(false);
                }
                e.stopPropagation();
              }}
              className="h-6 w-28 rounded-full border border-border bg-card px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
              placeholder="Label"
            />
          ) : workMode === "preview" ? (
            label ? (
              <span
                style={{
                  ...(data?.labelTextColor
                    ? { color: data.labelTextColor }
                    : {}),
                  ...(data?.labelBgColor
                    ? { backgroundColor: data.labelBgColor }
                    : {}),
                  ...(data?.labelBorderColor
                    ? { borderColor: data.labelBorderColor }
                    : {}),
                }}
                className={cn(
                  "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium",
                  !data?.labelBgColor && "bg-card",
                  !data?.labelBorderColor && "border-border",
                  !data?.labelTextColor && "text-muted-foreground"
                )}
              >
                {label}
              </span>
            ) : null
          ) : (
            <button
              type="button"
              onDoubleClick={() => setEditing(true)}
              data-empty-label={label ? undefined : "true"}
              style={{
                ...(data?.labelTextColor ? { color: data.labelTextColor } : {}),
                ...(data?.labelBgColor
                  ? { backgroundColor: data.labelBgColor }
                  : {}),
                ...(data?.labelBorderColor
                  ? { borderColor: data.labelBorderColor }
                  : {}),
              }}
              className={cn(
                "h-6 rounded-full border px-2.5 text-xs font-medium transition-all",
                !data?.labelBgColor && "bg-card",
                !data?.labelBorderColor && "border-border",
                !data?.labelTextColor &&
                  "text-muted-foreground hover:text-foreground",
                selected && !data?.labelBorderColor && "border-ring",
                selected && !data?.labelTextColor && "text-foreground",
                !label && "opacity-0 hover:opacity-100",
                selected && !label && "opacity-100"
              )}
            >
              {label || "+ label"}
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
