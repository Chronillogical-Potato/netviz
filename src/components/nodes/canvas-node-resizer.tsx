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
    position: "-left-6 -top-6",
  },
  {
    key: "top-right",
    position: "-right-6 -top-6",
  },
  {
    key: "bottom-right",
    position: "-bottom-6 -right-6",
  },
  {
    key: "bottom-left",
    position: "-bottom-6 -left-6",
  },
] as const;

export function NodeRotationControls({
  nodeId,
  rotation,
  visible,
}: {
  nodeId: string;
  rotation: number;
  visible: boolean;
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
          className={`nv-rotation-zone nodrag nopan pointer-events-auto absolute z-20 h-5 w-5 touch-none ${corner.position}`}
          onPointerDown={startRotation}
          onPointerMove={rotate}
          onPointerUp={finishRotation}
          onPointerCancel={finishRotation}
        />
      ))}
    </>
  );
}
