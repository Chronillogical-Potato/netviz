import { memo, useRef } from "react";
import {
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import { useFlowStore, type ImageNode } from "@/store/flow-store";
import { cn } from "@/lib/utils";
import { CanvasNodeResizer } from "./canvas-node-resizer";
import { Image as ImageIcon } from "@/ui/icons";

const HANDLE_POSITIONS: { pos: Position; key: string }[] = [
  { pos: Position.Top, key: "top" },
  { pos: Position.Right, key: "right" },
  { pos: Position.Bottom, key: "bottom" },
  { pos: Position.Left, key: "left" },
];

function ImageNodeComponent({ id, data, selected }: NodeProps<ImageNode>) {
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasBg = !!data.bgColor;
  const hasBorder = !!data.borderColor;
  const scale = Math.max(25, Math.min(300, data.scale ?? 100)) / 100;
  const opacity = Math.max(0, Math.min(100, data.opacity ?? 100)) / 100;

  const loadImage = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => updateNodeData(id, { src: String(reader.result) });
    reader.readAsDataURL(file);
  };

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-md border",
        !hasBg && "bg-card",
        !hasBorder && "border-border"
      )}
      style={{
        ...(hasBg ? { backgroundColor: data.bgColor } : {}),
        ...(hasBorder ? { borderColor: data.borderColor } : {}),
        ...(typeof data.borderRadius === "number"
          ? { borderRadius: data.borderRadius }
          : {}),
        ...(typeof data.borderWidth === "number"
          ? { borderWidth: data.borderWidth }
          : {}),
        borderStyle: data.borderStyle ?? "solid",
      }}
    >
      <CanvasNodeResizer
        isVisible={selected}
        lineClassName="!border-ring/70"
        handleClassName="!h-1.5 !w-1.5 !rounded-[1px] !border !border-ring !bg-white !shadow-sm"
      />
      {HANDLE_POSITIONS.map(({ pos, key }) => (
        <Handle key={key} type="source" position={pos} id={key} />
      ))}
      {data.src ? (
        <img
          src={data.src}
          alt={data.alt ?? ""}
          className="pointer-events-none h-full w-full select-none"
          style={{
            objectFit: data.fit ?? "contain",
            opacity,
            transform: `scale(${scale})`,
            transformOrigin: "center",
          }}
          draggable={false}
        />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="nodrag nopan flex h-full w-full flex-col items-center justify-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label="Choose image"
        >
          <ImageIcon className="h-5 w-5" />
          <span>Click to add image</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) loadImage(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export const ImageNodeView = memo(ImageNodeComponent);
