import { memo } from "react";
import {
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import type { StepNode } from "@/store/flow-store";
import { ACCENT_CLASSES } from "@/blocks/registry";
import { cn } from "@/lib/utils";
import { CanvasNodeResizer } from "./canvas-node-resizer";

const HANDLE_POSITIONS: { pos: Position; key: string }[] = [
  { pos: Position.Top, key: "top" },
  { pos: Position.Right, key: "right" },
  { pos: Position.Bottom, key: "bottom" },
  { pos: Position.Left, key: "left" },
];

function StepNodeComponent({ data, selected }: NodeProps<StepNode>) {
  const accentKey = data.accent ?? "indigo";
  const accent = ACCENT_CLASSES[accentKey];

  const style: React.CSSProperties = {};
  if (data.bgColor) style.backgroundColor = data.bgColor;
  if (data.titleColor) style.color = data.titleColor;
  if (data.borderColor) style.borderColor = data.borderColor;

  return (
    <div
      className={cn(
        "step-card relative flex h-full w-full select-none items-center justify-center rounded-full border-2 font-semibold tabular-nums shadow-sm",
        !data.bgColor && accent.tile,
        !data.borderColor && accent.border,
        !data.titleColor && accent.icon
      )}
      style={style}
    >
      <CanvasNodeResizer
        isVisible={selected}

        keepAspectRatio
        lineClassName="!border-ring/70"
        handleClassName="!h-1.5 !w-1.5 !rounded-[1px] !border !border-ring !bg-white !shadow-sm"
      />
      {HANDLE_POSITIONS.map(({ pos, key }) => (
        <Handle key={key} type="source" position={pos} id={key} />
      ))}
      <span className="text-base leading-none">{data.step}</span>
    </div>
  );
}

export const StepNodeView = memo(StepNodeComponent);
