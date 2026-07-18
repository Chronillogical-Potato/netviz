import { memo } from "react";
import {
  Handle,
  NodeResizer,
  Position,
  type NodeProps,
} from "@xyflow/react";
import { resolveBlock, useFlowStore, type InfraNode } from "@/store/flow-store";
import { ACCENT_CLASSES, CORE_BLOCKS } from "@/blocks/registry";
import { resolveIcon } from "@/blocks/icons";
import { cn } from "@/lib/utils";

const HANDLE_POSITIONS: { pos: Position; key: string }[] = [
  { pos: Position.Top, key: "top" },
  { pos: Position.Right, key: "right" },
  { pos: Position.Bottom, key: "bottom" },
  { pos: Position.Left, key: "left" },
];

function InfraNodeComponent({ data, selected }: NodeProps<InfraNode>) {
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

  const titleStyle = data.titleColor ? { color: data.titleColor } : undefined;
  const subtitleStyle = data.subtitleColor
    ? { color: data.subtitleColor }
    : undefined;

  const showIcon = !!(customIcon || iconName);

  const iconTile = showIcon ? (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg",
        !customIcon && accent.tile
      )}
    >
      {customIcon ? (
        <img
          src={customIcon}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <Icon className={cn("h-5 w-5", accent.icon)} />
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

  return (
    <div
      className={cn(
        "infra-card group relative flex h-full w-full select-none rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-[box-shadow,border-color]",
        "hover:shadow-md"
      )}
      style={{
        ...(data.bgColor ? { backgroundColor: data.bgColor } : {}),
        ...(data.borderColor ? { borderColor: data.borderColor } : {}),
        ...(typeof data.borderRadius === "number"
          ? { borderRadius: data.borderRadius }
          : {}),
        ...(typeof data.borderWidth === "number"
          ? { borderWidth: data.borderWidth }
          : {}),
      }}
    >
      <NodeResizer
        isVisible={selected}

        lineClassName="!border-ring/70"
        handleClassName="!h-2.5 !w-2.5 !rounded-[3px] !border !border-ring !bg-white !shadow-sm"
      />
      {HANDLE_POSITIONS.map(({ pos, key }) => (
        <Handle key={key} type="source" position={pos} id={key} />
      ))}

      <div
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
      </div>
    </div>
  );
}

export const InfraNodeView = memo(InfraNodeComponent);
