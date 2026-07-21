import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useFlowStore, type TextNode } from "@/store/flow-store";
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

export function InlineTextEditor({
  value,
  focusWhenReady = true,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  focusWhenReady?: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const longestLine = value
    .split("\n")
    .reduce((length, line) => Math.max(length, line.length), 0);

  useEffect(() => {
    if (!focusWhenReady) return;
    const focusEditor = () => {
      ref.current?.focus({ preventScroll: true });
      ref.current?.select();
    };
    focusEditor();
    const frame = requestAnimationFrame(focusEditor);
    return () => cancelAnimationFrame(frame);
  }, [focusWhenReady]);

  return (
    <textarea
      ref={ref}
      autoFocus={focusWhenReady}
      aria-label="Edit text"
      value={value}
      rows={Math.max(1, value.split("\n").length)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onCommit();
        }
      }}
      className="nodrag nopan nowheel min-w-[4ch] max-w-[360px] resize-none overflow-hidden bg-transparent p-0 outline-none"
      style={{
        width: `${Math.max(4, longestLine + 1)}ch`,
        color: "inherit",
        font: "inherit",
        lineHeight: "inherit",
      }}
    />
  );
}

function TextNodeComponent({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<TextNode>) {
  const editingTextNodeId = useFlowStore((state) => state.editingTextNodeId);
  const setEditingTextNode = useFlowStore((state) => state.setEditingTextNode);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const workMode = useFlowStore((state) => state.workMode);
  const editing = workMode === "design" && editingTextNodeId === id;
  const [draft, setDraft] = useState(data.text);
  const accentKey = data.accent ?? "slate";
  const accent = ACCENT_CLASSES[accentKey];

  const style: React.CSSProperties = {};
  if (data.bgColor) style.backgroundColor = data.bgColor;
  if (data.titleColor) style.color = data.titleColor;
  if (typeof data.borderRadius === "number")
    style.borderRadius = data.borderRadius;
  if (data.rotation) {
    style.transform = `rotate(${data.rotation}deg)`;
    style.transformOrigin = "center";
  }
  const hasFontSize = typeof data.fontSize === "number";
  if (hasFontSize) {
    const fs = data.fontSize as number;
    style.fontSize = fs;
    style.lineHeight = 1.25;
    style.paddingInline = fs * 0.71;
    style.paddingBlock = fs * 0.29;
    style.maxWidth = Math.max(360, fs * 26);
  }

  useEffect(() => {
    if (!editing) setDraft(data.text);
  }, [data.text, editing]);

  const commit = () => {
    const next = draft || "Text";
    if (next !== data.text) updateNodeData(id, { text: next });
    setEditingTextNode(null);
  };

  return (
    <div
      className={cn(
        "text-card relative inline-flex h-full w-full min-w-max items-center rounded-md font-medium leading-tight",
        !hasFontSize && "max-w-[360px] px-2.5 py-1 text-sm",
        !data.bgColor && accent.tile,
        !data.titleColor && accent.icon,
        (selected || editing) && "ring-1 ring-ring"
      )}
      style={style}
      title={
        !editing && workMode === "design" ? "Double-click to edit" : undefined
      }
      onDoubleClick={(event) => {
        if (workMode !== "design") return;
        event.stopPropagation();
        setEditingTextNode(id);
      }}
    >
      {editing ? (
        <InlineTextEditor
          value={draft}
          focusWhenReady={(width ?? 0) > 0 && (height ?? 0) > 0}
          onChange={setDraft}
          onCommit={commit}
          onCancel={() => {
            setDraft(data.text);
            setEditingTextNode(null);
          }}
        />
      ) : (
        <span className="whitespace-pre-wrap break-words">
          {data.text || "Text"}
        </span>
      )}
      <CanvasNodeResizer
        isVisible={selected && !editing}
        minWidth={32}
        minHeight={20}
        lineClassName="!border-ring/70"
        handleClassName="!h-1.5 !w-1.5 !rounded-[1px] !border !border-ring !bg-white !shadow-sm"
      />
      <NodeRotationControls
        nodeId={id}
        rotation={data.rotation ?? 0}
        visible={selected && !editing}
      />
      {HANDLE_POSITIONS.map(({ pos, key }) => (
        <Handle key={key} type="source" position={pos} id={key} />
      ))}
    </div>
  );
}

export const TextNodeView = memo(TextNodeComponent);
