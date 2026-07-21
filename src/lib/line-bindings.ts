import { lineGeometryFromPoints } from "@/lib/line-geometry";
import type {
  AppNode,
  LineBinding,
  LineBindingHandle,
  LineNode,
  LinePoint,
} from "@/store/flow-store";

function nodeSize(node: AppNode) {
  const style = node.style as { width?: unknown; height?: unknown } | undefined;
  return {
    width:
      node.measured?.width ??
      node.width ??
      (typeof style?.width === "number" ? style.width : 0),
    height:
      node.measured?.height ??
      node.height ??
      (typeof style?.height === "number" ? style.height : 0),
  };
}

function rotateAroundCenter(
  point: LinePoint,
  center: LinePoint,
  degrees: number
) {
  if (!degrees) return point;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function lineBindingPoint(
  node: AppNode,
  handleId: LineBindingHandle
): LinePoint {
  const { width, height } = nodeSize(node);
  const left = node.position.x;
  const top = node.position.y;
  const center = { x: left + width / 2, y: top + height / 2 };
  const point =
    handleId === "top"
      ? { x: center.x, y: top }
      : handleId === "right"
        ? { x: left + width, y: center.y }
        : handleId === "bottom"
          ? { x: center.x, y: top + height }
          : { x: left, y: center.y };
  const rotation = (node.data as { rotation?: number }).rotation ?? 0;
  return rotateAroundCenter(point, center, rotation);
}

export function syncBoundLines(nodes: AppNode[]): AppNode[] {
  const hasBindings = nodes.some(
    (node) =>
      node.type === "line" &&
      (node.data.startBinding || node.data.endBinding)
  );
  if (!hasBindings) return nodes;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    if (node.type !== "line") return node;

    const boundOrCurrentPoint = (
      line: LineNode,
      binding: LineBinding | undefined,
      point: LinePoint | undefined
    ) => {
      const boundNode = binding ? byId.get(binding.nodeId) : undefined;
      if (boundNode && binding) {
        return lineBindingPoint(boundNode, binding.handleId);
      }
      return {
        x: line.position.x + (point?.x ?? 0),
        y: line.position.y + (point?.y ?? 0),
      };
    };

    const start = boundOrCurrentPoint(
      node,
      node.data.startBinding,
      node.data.start
    );
    const end = boundOrCurrentPoint(node, node.data.endBinding, node.data.end);
    const geometry = lineGeometryFromPoints(start, end);
    return {
      ...node,
      position: geometry.position,
      style: {
        ...(node.style ?? {}),
        width: geometry.width,
        height: geometry.height,
      },
      data: {
        ...node.data,
        start: geometry.start,
        end: geometry.end,
      },
    };
  });
}

export function findLineBindingAtPoint(
  clientX: number,
  clientY: number,
  radius = 24
): LineBinding | null {
  if (typeof document === "undefined") return null;
  let nearestBinding: LineBinding | null = null;
  let nearestDistance = radius;
  const handles = document.querySelectorAll<HTMLElement>(
    ".react-flow__handle[data-nodeid][data-handleid]"
  );
  handles.forEach((handle) => {
    const nodeId = handle.dataset.nodeid;
    const handleId = handle.dataset.handleid as LineBindingHandle | undefined;
    if (
      !nodeId ||
      !handleId ||
      !["top", "right", "bottom", "left"].includes(handleId)
    ) {
      return;
    }
    const bounds = handle.getBoundingClientRect();
    const distance = Math.hypot(
      clientX - (bounds.left + bounds.width / 2),
      clientY - (bounds.top + bounds.height / 2)
    );
    if (distance <= nearestDistance) {
      nearestBinding = { nodeId, handleId };
      nearestDistance = distance;
    }
  });
  return nearestBinding;
}
