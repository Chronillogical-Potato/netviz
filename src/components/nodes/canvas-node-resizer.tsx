import {
  useEffect,
  useRef,
  type ComponentProps,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  NodeResizer,
  useStore,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useFlowStore } from "@/store/flow-store";
import { cn } from "@/lib/utils";

type CanvasNodeResizerProps = ComponentProps<typeof NodeResizer>;

export function CanvasNodeResizer({
  lineStyle,
  ...props
}: CanvasNodeResizerProps) {
  const zoom = useStore((state) => state.transform[2]);
  const zoomSafe = Math.max(zoom, 0.01);
  const scaledLineStyle = {
    ...lineStyle,
    "--nv-resize-line-width": `${1 / zoomSafe}px`,
  } as CSSProperties;

  return <NodeResizer {...props} lineStyle={scaledLineStyle} />;
}

export function rotationAfterPointerMove(
  rotation: number,
  previousPointerAngle: number,
  pointerAngle: number,
  snap: boolean
) {
  let delta = pointerAngle - previousPointerAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const next = ((rotation + delta) % 360 + 360) % 360;
  const result = snap ? Math.round(next / 15) * 15 : next;
  return Math.round(result * 10) / 10;
}

const ROTATION_CORNERS = [
  {
    key: "top-left",
    textPosition: "-left-1.5 -top-1.5",
    outerPosition: "-left-4 -top-4",
    arcRotation: "rotate-0",
  },
  {
    key: "top-right",
    textPosition: "-right-1.5 -top-1.5",
    outerPosition: "-right-4 -top-4",
    arcRotation: "rotate-90",
  },
  {
    key: "bottom-right",
    textPosition: "-bottom-1.5 -right-1.5",
    outerPosition: "-bottom-4 -right-4",
    arcRotation: "rotate-180",
  },
  {
    key: "bottom-left",
    textPosition: "-bottom-1.5 -left-1.5",
    outerPosition: "-bottom-4 -left-4",
    arcRotation: "-rotate-90",
  },
] as const;

export function NodeRotationControls({
  nodeId,
  rotation,
  visible,
  showCornerHandles = false,
}: {
  nodeId: string;
  rotation: number;
  visible: boolean;
  showCornerHandles?: boolean;
}) {
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const updateNodeInternals = useUpdateNodeInternals();
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    center: { x: number; y: number };
    pointerAngle: number;
    rotation: number;
  } | null>(null);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  if (!visible) return null;

  const pointerAngle = (
    center: { x: number; y: number },
    event: ReactPointerEvent<HTMLButtonElement>
  ) =>
    (Math.atan2(event.clientY - center.y, event.clientX - center.x) * 180) /
    Math.PI;

  const startRotation = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const node = event.currentTarget.closest(".react-flow__node");
    if (!node) return;
    const bounds = node.getBoundingClientRect();
    const center = {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      center,
      pointerAngle: pointerAngle(center, event),
      rotation,
    };
  };

  const rotate = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const angle = pointerAngle(drag.center, event);
    const next = rotationAfterPointerMove(
      drag.rotation,
      drag.pointerAngle,
      angle,
      event.shiftKey
    );
    drag.rotation = next;
    drag.pointerAngle = angle;
    updateNodeData(nodeId, { rotation: next });
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        updateNodeInternals(nodeId);
      });
    }
  };

  const finishRotation = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    updateNodeInternals(nodeId);
  };

  return (
    <>
      {ROTATION_CORNERS.map((corner) => (
        <button
          key={corner.key}
          type="button"
          aria-label={`Rotate from ${corner.key.replace("-", " ")} corner`}
          title="Drag to rotate · Hold Shift to snap"
          className={cn(
            "nodrag nopan group pointer-events-auto absolute z-20 flex h-3 w-3 cursor-grab items-center justify-center touch-none active:cursor-grabbing",
            showCornerHandles ? corner.textPosition : corner.outerPosition
          )}
          onPointerDown={startRotation}
          onPointerMove={rotate}
          onPointerUp={finishRotation}
          onPointerCancel={finishRotation}
        >
          <span
            className={cn(
              showCornerHandles
                ? "h-2 w-2 rounded-[2px] border border-ring bg-white shadow-sm"
                : "h-2.5 w-2.5 rounded-full border border-ring border-b-transparent border-r-transparent opacity-0 transition-opacity group-hover:opacity-100",
              !showCornerHandles && corner.arcRotation
            )}
          />
        </button>
      ))}
    </>
  );
}
