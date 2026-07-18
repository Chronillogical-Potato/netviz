import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TextNode } from "@/store/flow-store";
import { ACCENT_CLASSES } from "@/blocks/registry";
import { cn } from "@/lib/utils";

const HANDLE_POSITIONS: { pos: Position; key: string }[] = [
  { pos: Position.Top, key: "top" },
  { pos: Position.Right, key: "right" },
  { pos: Position.Bottom, key: "bottom" },
  { pos: Position.Left, key: "left" },
];

function TextNodeComponent({ data, selected }: NodeProps<TextNode>) {
  const accentKey = data.accent ?? "slate";
  const accent = ACCENT_CLASSES[accentKey];

  const style: React.CSSProperties = {};
  if (data.bgColor) style.backgroundColor = data.bgColor;
  if (data.titleColor) style.color = data.titleColor;
  if (typeof data.borderRadius === "number")
    style.borderRadius = data.borderRadius;
  const hasFontSize = typeof data.fontSize === "number";
  if (hasFontSize) {
    const fs = data.fontSize as number;
    style.fontSize = fs;
    style.lineHeight = 1.25;
    style.paddingInline = fs * 0.71;
    style.paddingBlock = fs * 0.29;
    style.maxWidth = Math.max(360, fs * 26);
  }

  return (
    <div
      className={cn(
        "text-card relative inline-flex w-max items-center rounded-md font-medium leading-tight",
        !hasFontSize && "max-w-[360px] px-2.5 py-1 text-sm",
        !data.bgColor && accent.tile,
        !data.titleColor && accent.icon,
        selected && "ring-1 ring-ring"
      )}
      style={style}
    >
      {HANDLE_POSITIONS.map(({ pos, key }) => (
        <Handle key={key} type="source" position={pos} id={key} />
      ))}
      <span className="whitespace-pre-wrap break-words">
        {data.text || "Text"}
      </span>
    </div>
  );
}

export const TextNodeView = memo(TextNodeComponent);
