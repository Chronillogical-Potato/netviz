import { memo } from "react";
import {
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import { resolveBlock, useFlowStore, type InfraNode } from "@/store/flow-store";
import { ACCENT_CLASSES, CORE_BLOCKS } from "@/blocks/registry";
import { resolveIcon } from "@/blocks/icons";
import { cn } from "@/lib/utils";
import { NodeMotionBorder } from "./node-motion-border";
import { CanvasNodeResizer } from "./canvas-node-resizer";

const HANDLE_POSITIONS: { pos: Position; key: string }[] = [
  { pos: Position.Top, key: "top" },
  { pos: Position.Right, key: "right" },
  { pos: Position.Bottom, key: "bottom" },
  { pos: Position.Left, key: "left" },
];

function InfraNodeComponent({ id, data, selected }: NodeProps<InfraNode>) {
  const customBlocks = useFlowStore((s) => s.customBlocks);
  const block = resolveBlock(data.blockId, customBlocks) ?? CORE_BLOCKS[0];
  const iconName = data.iconName ?? block.iconName;
  const accentKey = data.accent ?? block.accent;
  const Icon = resolveIcon(iconName);
  const accent = ACCENT_CLASSES[accentKey];
  const variant = data.variant ?? block.variant ?? "row";
  const isCard = variant === "card";
  const iconPosition = data.iconPosition ?? (isCard ? "top" : "left");
  const textAlign = data.textAlign ?? (isCard ? "center" : "left");
  const customIcon = data.customIcon;
  const isCircle = data.shape === "circle";

  const titleStyle = data.titleColor ? { color: data.titleColor } : undefined;
  const subtitleStyle = data.subtitleColor
    ? { color: data.subtitleColor }
    : undefined;

  const showIcon = !!(customIcon || iconName);

  const iconTile = showIcon ? (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        isCircle
          ? "h-24 w-24 rounded-full border border-border bg-card shadow-sm"
          : "h-10 w-10 rounded-lg",
        !customIcon && accent.tile
      )}
      style={isCircle ? {
        ...(data.bgColor ? { backgroundColor: data.bgColor } : {}),
        ...(data.borderColor ? { borderColor: data.borderColor } : {}),
        ...(typeof data.borderWidth === "number"
          ? { borderWidth: data.borderWidth }
          : {}),
      } : undefined}
    >
      {customIcon ? (
        <img
          src={customIcon}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <Icon
          className={cn(isCircle ? "h-8 w-8" : "h-5 w-5", accent.icon)}
          style={data.iconColor ? { color: data.iconColor } : undefined}
        />
      )}
    </div>
  ) : null;

  const isVertical = iconPosition === "top" || iconPosition === "bottom";
  const textBlock = (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        !isVertical && textAlign !== "center" && "flex-1",
        textAlign === "center" && "items-center text-center",
        textAlign === "right" && "items-end text-right",
        textAlign === "left" && "items-start text-left"
      )}
    >
      <span
        className="truncate text-sm font-semibold text-foreground"
        style={titleStyle}
      >
        {data.label || block.label}
      </span>
      {data.subtitle ? (
        <span
          className="truncate text-xs text-muted-foreground"
          style={subtitleStyle}
        >
          {data.subtitle}
        </span>
      ) : null}
    </div>
  );

  const iconFirst = iconPosition === "left" || iconPosition === "top";

  const circleContent = (
    <div className="flex h-full w-full flex-col items-center justify-start gap-2">
      {iconTile}
      {textBlock}
    </div>
  );

  return (
    <div
      className={cn(
        "infra-card group relative flex h-full w-full select-none text-card-foreground transition-[box-shadow,border-color]",
        isCircle
          ? "bg-transparent"
          : "rounded-xl border border-border bg-card shadow-sm",
        "hover:shadow-md"
      )}
      style={{
        ...(!isCircle && data.bgColor ? { backgroundColor: data.bgColor } : {}),
        ...(!isCircle && data.borderColor ? { borderColor: data.borderColor } : {}),
        ...(!isCircle && typeof data.borderRadius === "number"
          ? { borderRadius: data.borderRadius }
          : {}),
        ...(typeof data.borderWidth === "number"
          ? { borderWidth: data.borderWidth }
          : {}),
      }}
    >
      <NodeMotionBorder nodeId={id} />
      <CanvasNodeResizer
        isVisible={selected && !isCircle}

        lineClassName="!border-ring/70"
        handleClassName="!h-1.5 !w-1.5 !rounded-[1px] !border !border-ring !bg-white !shadow-sm"
      />
      {HANDLE_POSITIONS.map(({ pos, key }) => (
        <Handle
          key={key}
          type="source"
          position={pos}
          id={key}
          style={isCircle ? (
            key === "left" ? { left: 22, top: 48 } :
            key === "right" ? { right: 22, top: 48 } :
            key === "bottom" ? { top: 96, bottom: "auto" } :
            undefined
          ) : undefined}
        />
      ))}

      {isCircle ? circleContent : <div
        className={cn(
          "flex h-full w-full gap-3 p-3",
          isVertical ? "flex-col" : "flex-row",
          isVertical
            ? textAlign === "center"
              ? "items-center"
              : textAlign === "right"
              ? "items-end"
              : "items-start"
            : "items-center",
          isVertical && "justify-center",
          !isVertical && textAlign === "center" && "justify-center"
        )}
      >
        {iconFirst && iconTile}
        {textBlock}
        {!iconFirst && iconTile}
      </div>}
    </div>
  );
}

export const InfraNodeView = memo(InfraNodeComponent);
