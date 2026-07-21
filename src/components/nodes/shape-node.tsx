import { memo } from "react";
import {
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import type { ShapeNode } from "@/store/flow-store";
import { ACCENT_CLASSES } from "@/blocks/registry";
import { cn } from "@/lib/utils";
import {
  CanvasNodeResizer,
  NodeRotationControls,
} from "./canvas-node-resizer";

const HANDLE_POSITIONS: { pos: Position; key: string }[] = [
  { pos: Position.Top, key: "top" },
  { pos: Position.Right, key: "right" },
  { pos: Position.Bottom, key: "bottom" },
  { pos: Position.Left, key: "left" },
];

const BORDER_STYLE_CLASS = {
  solid: "border-solid",
  dashed: "border-dashed",
  dotted: "border-dotted",
} as const;

function ShapeNodeComponent({ id, data, selected }: NodeProps<ShapeNode>) {
  const accentKey = data.accent ?? "slate";
  const accent = ACCENT_CLASSES[accentKey];
  const isCircle = data.shape === "circle";
  const borderStyle = data.borderStyle ?? "dashed";
  const radius =
    !isCircle && typeof data.borderRadius === "number" ? data.borderRadius : 12;

  return (
    <div
      className={cn(
        "shape-card pointer-events-none relative h-full w-full select-none border-2",
        BORDER_STYLE_CLASS[borderStyle],
        !data.bgColor && accent.tile,
        !data.borderColor && accent.border,
        isCircle ? "rounded-full" : "rounded-xl"
      )}
      style={{
        ...(data.bgColor ? { backgroundColor: data.bgColor } : {}),
        ...(data.borderColor ? { borderColor: data.borderColor } : {}),
        ...(!isCircle && typeof data.borderRadius === "number"
          ? { borderRadius: data.borderRadius }
          : {}),
        ...(data.rotation
          ? {
              transform: `rotate(${data.rotation}deg)`,
              transformOrigin: "center",
            }
          : {}),
      }}
    >
      {/* Transparent SVG hit target clipped to the shape geometry: the
          whole interior is clickable, but a circle's transparent square
          corners fall through to whatever is beneath. Rendered first so
          the resize handles below stay on top and clickable. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        {isCircle ? (
          <ellipse
            cx="50%"
            cy="50%"
            rx="50%"
            ry="50%"
            fill="transparent"
            style={{ pointerEvents: "all" }}
          />
        ) : (
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx={radius}
            ry={radius}
            fill="transparent"
            style={{ pointerEvents: "all" }}
          />
        )}
      </svg>
      <CanvasNodeResizer
        isVisible={selected}
        keepAspectRatio={isCircle}
        lineClassName="!border-ring/70"
        handleClassName="!h-1.5 !w-1.5 !rounded-[1px] !border !border-ring !bg-white !shadow-sm"
      />
      <NodeRotationControls
        nodeId={id}
        rotation={data.rotation ?? 0}
        visible={selected}
      />
      {HANDLE_POSITIONS.map(({ pos, key }) => (
        <Handle key={key} type="source" position={pos} id={key} />
      ))}
      {data.label ? (
        <span
          className={cn(
            "pointer-events-none absolute left-3 top-2 text-[11px] font-semibold tracking-wider",
            !data.titleColor && accent.icon
          )}
          style={data.titleColor ? { color: data.titleColor } : undefined}
        >
          {data.label}
        </span>
      ) : null}
    </div>
  );
}

export const ShapeNodeView = memo(ShapeNodeComponent);
