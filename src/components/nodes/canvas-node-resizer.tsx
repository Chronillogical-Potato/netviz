import type { ComponentProps, CSSProperties } from "react";
import { NodeResizer, useStore } from "@xyflow/react";

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
