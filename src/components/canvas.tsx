import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ConnectionMode,
  Position,
  ReactFlow,
  SelectionMode,
  getBezierPath,
  getNodesBounds,
  useReactFlow,
  useViewport,
  type EdgeTypes,
  type FinalConnectionState,
  type NodeChange,
  type NodeTypes,
  type OnBeforeDelete,
} from "@xyflow/react";
import { resolveIcon } from "@/blocks/icons";
import "@xyflow/react/dist/style.css";
import {
  DEFAULT_MARKER,
  useFlowStore,
  type AppNode,
  type LabeledEdge as LabeledEdgeModel,
  type ShapeKind,
} from "@/store/flow-store";
import { ACCENT_CLASSES, CORE_BLOCKS } from "@/blocks/registry";
import { InfraNodeView } from "./nodes/infra-node";
import { ShapeNodeView } from "./nodes/shape-node";
import { TextNodeView } from "./nodes/text-node";
import { StepNodeView } from "./nodes/step-node";
import { LineNodeView } from "./nodes/line-node";
import { ImageNodeView } from "./nodes/image-node";
import { CodeNodeView } from "./nodes/code-node";
import { LabeledEdge } from "./edges/labeled-edge";
import { CanvasToolbar, type CanvasTool } from "./canvas-toolbar";
import { cn } from "@/lib/utils";
import {
  computeSnap,
  nodeDims,
  resolveSnapPosition,
  type ActiveSnap,
  type Guide,
} from "@/lib/snapping";
import { findLineBindingAtPoint } from "@/lib/line-bindings";
import { scenarioRuntime } from "@/animation/runtime-instance";
import type { TargetFrame } from "@/animation/runtime";

const nodeTypes: NodeTypes = {
  infra: InfraNodeView,
  shape: ShapeNodeView,
  text: TextNodeView,
  step: StepNodeView,
  line: LineNodeView,
  image: ImageNodeView,
  code: CodeNodeView,
};
const edgeTypes: EdgeTypes = { labeled: LabeledEdge };

const DRAG_MIME = "application/x-netviz";

type DimSeg = { from: number; to: number; along: number; value: number };

export const DIMENSION_BADGE_CLASS =
  "rounded-[2px] bg-primary px-1.5 py-0.5 text-xs font-semibold leading-none text-white whitespace-nowrap shadow-sm";

const CONNECT_PICKER_WIDTH = 320;
const CONNECT_PICKER_MAX_HEIGHT = 400;
const CONNECT_PICKER_MARGIN = 8;

export function getConnectPickerPosition(
  point: { x: number; y: number },
  viewport: { width: number; height: number }
) {
  const height = Math.min(
    CONNECT_PICKER_MAX_HEIGHT,
    Math.max(0, viewport.height - CONNECT_PICKER_MARGIN * 2)
  );
  return {
    left: Math.max(
      CONNECT_PICKER_MARGIN,
      Math.min(
        point.x,
        viewport.width - CONNECT_PICKER_WIDTH - CONNECT_PICKER_MARGIN
      )
    ),
    top: Math.max(
      CONNECT_PICKER_MARGIN,
      Math.min(point.y, viewport.height - height - CONNECT_PICKER_MARGIN)
    ),
  };
}

function computeDimsToTarget(sel: AppNode, target: AppNode) {
  const { w: sw, h: sh } = nodeDims(sel);
  const { w: tw, h: th } = nodeDims(target);
  if (sw === 0 || sh === 0 || tw === 0 || th === 0) return null;
  const sL = sel.position.x, sR = sL + sw, sT = sel.position.y, sB = sT + sh;
  const tL = target.position.x, tR = tL + tw, tT = target.position.y, tB = tT + th;

  const vOverlap = Math.max(sT, tT) < Math.min(sB, tB);
  const hOverlap = Math.max(sL, tL) < Math.min(sR, tR);

  const out: {
    sL: number; sR: number; sT: number; sB: number; sw: number; sh: number;
    left?: DimSeg; right?: DimSeg; top?: DimSeg; bottom?: DimSeg;
    gapH?: DimSeg; gapV?: DimSeg;
  } = { sL, sR, sT, sB, sw, sh };

  if (vOverlap && hOverlap) {
    const vMid = (Math.max(sT, tT) + Math.min(sB, tB)) / 2;
    const hMid = (Math.max(sL, tL) + Math.min(sR, tR)) / 2;
    out.left = { from: Math.min(sL, tL), to: Math.max(sL, tL), along: vMid, value: Math.abs(sL - tL) };
    out.right = { from: Math.min(sR, tR), to: Math.max(sR, tR), along: vMid, value: Math.abs(sR - tR) };
    out.top = { from: Math.min(sT, tT), to: Math.max(sT, tT), along: hMid, value: Math.abs(sT - tT) };
    out.bottom = { from: Math.min(sB, tB), to: Math.max(sB, tB), along: hMid, value: Math.abs(sB - tB) };
  } else if (vOverlap) {
    const along = (Math.max(sT, tT) + Math.min(sB, tB)) / 2;
    if (tR <= sL) out.gapH = { from: tR, to: sL, along, value: sL - tR };
    else if (tL >= sR) out.gapH = { from: sR, to: tL, along, value: tL - sR };
  } else if (hOverlap) {
    const along = (Math.max(sL, tL) + Math.min(sR, tR)) / 2;
    if (tB <= sT) out.gapV = { from: tB, to: sT, along, value: sT - tB };
    else if (tT >= sB) out.gapV = { from: sB, to: tT, along, value: tT - sB };
  } else {
    const cy = (sT + sB) / 2;
    const cx = (sL + sR) / 2;
    if (tR <= sL) out.gapH = { from: tR, to: sL, along: cy, value: sL - tR };
    else if (tL >= sR) out.gapH = { from: sR, to: tL, along: cy, value: tL - sR };
    if (tB <= sT) out.gapV = { from: tB, to: sT, along: cx, value: sT - tB };
    else if (tT >= sB) out.gapV = { from: sB, to: tT, along: cx, value: tT - sB };
  }
  return out;
}

type DragPayload =
  | { kind: "infra"; blockId: string }
  | { kind: "template"; templateId: string }
  | { kind: "shape"; shape: ShapeKind }
  | { kind: "text" }
  | { kind: "image" }
  | { kind: "step" }
  | { kind: "code" };

function TurboDefs({ colors }: { colors: [string, string] }) {
  return (
    <svg className="pointer-events-none absolute h-0 w-0">
      <defs>
        <linearGradient id="turbo-edge" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colors[0]} />
          <stop offset="100%" stopColor={colors[1]} />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Overlays subscribe to the viewport themselves so pan/zoom frames only
// re-render these tiny components, never the whole canvas tree.
function GuidesOverlay({ guides }: { guides: Guide[] }) {
  const { x: vpX, y: vpY, zoom } = useViewport();
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full">
      {guides.map((g, i) => {
        if (g.axis === "x") {
          const x = vpX + g.pos * zoom;
          return (
            <line
              key={i}
              x1={x}
              x2={x}
              y1={vpY + g.from * zoom}
              y2={vpY + g.to * zoom}
              stroke="#0099ff"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          );
        }
        const y = vpY + g.pos * zoom;
        return (
          <line
            key={i}
            x1={vpX + g.from * zoom}
            x2={vpX + g.to * zoom}
            y1={y}
            y2={y}
            stroke="#0099ff"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        );
      })}
    </svg>
  );
}

function MeasureOverlay({
  selected,
  hoveredId,
  nodes,
}: {
  selected: AppNode;
  hoveredId: string | null;
  nodes: AppNode[];
}) {
  const { x: vpX, y: vpY, zoom } = useViewport();
  const { w: sw, h: sh } = nodeDims(selected);
  if (sw === 0 || sh === 0) return null;
  const sx = (fx: number) => vpX + fx * zoom;
  const sy = (fy: number) => vpY + fy * zoom;
  const sL = selected.position.x;
  const sR = sL + sw;
  const sT = selected.position.y;
  const sB = sT + sh;
  const cx = sx((sL + sR) / 2);
  const hovered =
    hoveredId && hoveredId !== selected.id
      ? nodes.find((n) => n.id === hoveredId) ?? null
      : null;
  const d = hovered ? computeDimsToTarget(selected, hovered) : null;
  const measureLabel =
    `absolute -translate-x-1/2 -translate-y-1/2 ${DIMENSION_BADGE_CLASS}`;
  const hLine = (seg: DimSeg) => (
    <line
      x1={sx(seg.from)}
      x2={sx(seg.to)}
      y1={sy(seg.along)}
      y2={sy(seg.along)}
      stroke="#0099ff"
      strokeWidth={1}
    />
  );
  const vLine = (seg: DimSeg) => (
    <line
      x1={sx(seg.along)}
      x2={sx(seg.along)}
      y1={sy(seg.from)}
      y2={sy(seg.to)}
      stroke="#0099ff"
      strokeWidth={1}
    />
  );
  const hLabel = (seg: DimSeg) => (
    <span
      className={measureLabel}
      style={{
        left: (sx(seg.from) + sx(seg.to)) / 2,
        top: sy(seg.along) - 12,
      }}
    >
      {Math.round(seg.value)}
    </span>
  );
  const vLabel = (seg: DimSeg) => (
    <span
      className={measureLabel}
      style={{
        left: sx(seg.along) + 16,
        top: (sy(seg.from) + sy(seg.to)) / 2,
      }}
    >
      {Math.round(seg.value)}
    </span>
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {d && (
        <svg className="absolute inset-0 h-full w-full">
          {d.left && hLine(d.left)}
          {d.right && hLine(d.right)}
          {d.gapH && hLine(d.gapH)}
          {d.top && vLine(d.top)}
          {d.bottom && vLine(d.bottom)}
          {d.gapV && vLine(d.gapV)}
        </svg>
      )}
      <span
        className={cn(
          "absolute -translate-x-1/2",
          DIMENSION_BADGE_CLASS
        )}
        style={{ left: cx, top: sy(sB) + 8 }}
      >
        {Math.round(sw)} × {Math.round(sh)}
      </span>
      {d?.left && hLabel(d.left)}
      {d?.right && hLabel(d.right)}
      {d?.gapH && hLabel(d.gapH)}
      {d?.top && vLabel(d.top)}
      {d?.bottom && vLabel(d.bottom)}
      {d?.gapV && vLabel(d.gapV)}
    </div>
  );
}

type DrawTool = "rect" | "circle" | "line" | "text";

export function isCanvasElementInteractionEnabled(
  tool: string,
  isPreview: boolean,
  isPickingAnimationPath: boolean
) {
  return !isPreview && !isPickingAnimationPath && tool !== "hand";
}

const nodeCenter = (node: AppNode) => {
  const { w, h } = nodeDims(node);
  return {
    x: node.position.x + w / 2,
    y: node.position.y + h / 2,
  };
};

export function resolveVideoFollowPoint(
  frames: readonly TargetFrame[],
  nodes: readonly AppNode[],
  edges: readonly LabeledEdgeModel[]
) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const edgePoints: Array<{ x: number; y: number }> = [];

  for (const frame of frames) {
    const edge = edgesById.get(frame.targetId);
    if (!edge) continue;
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) continue;
    const start = nodeCenter(source);
    const end = nodeCenter(target);
    for (const clip of frame.clips) {
      for (const progress of clip.timing.progresses) {
        edgePoints.push({
          x: start.x + (end.x - start.x) * progress,
          y: start.y + (end.y - start.y) * progress,
        });
      }
    }
  }

  const points =
    edgePoints.length > 0
      ? edgePoints
      : frames.flatMap((frame) => {
          const node = nodesById.get(frame.targetId);
          return node ? [nodeCenter(node)] : [];
        });
  if (points.length === 0) return null;
  return points.reduce(
    (center, point) => ({
      x: center.x + point.x / points.length,
      y: center.y + point.y / points.length,
    }),
    { x: 0, y: 0 }
  );
}

export function getVideoCameraViewport({
  contentBounds,
  viewport,
  frame,
  focus,
}: {
  contentBounds: { x: number; y: number; width: number; height: number };
  viewport: { x: number; y: number; zoom: number };
  frame: { width: number; height: number };
  focus: { x: number; y: number };
}) {
  const overflowX = contentBounds.width * viewport.zoom > frame.width * 0.9;
  const overflowY = contentBounds.height * viewport.zoom > frame.height * 0.9;
  if (!overflowX && !overflowY) return null;

  return {
    x: overflowX ? frame.width * 0.45 - focus.x * viewport.zoom : viewport.x,
    y: overflowY ? frame.height * 0.5 - focus.y * viewport.zoom : viewport.y,
    zoom: viewport.zoom,
  };
}

export function smoothVideoViewport(
  current: { x: number; y: number; zoom: number },
  target: { x: number; y: number; zoom: number },
  elapsedMs: number
) {
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 320);
  return {
    x: current.x + (target.x - current.x) * alpha,
    y: current.y + (target.y - current.y) * alpha,
    zoom: current.zoom + (target.zoom - current.zoom) * alpha,
  };
}

export function smoothVideoFocusPoint(
  current: { x: number; y: number },
  target: { x: number; y: number },
  elapsedMs: number
) {
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 180);
  return {
    x: current.x + (target.x - current.x) * alpha,
    y: current.y + (target.y - current.y) * alpha,
  };
}

export function getDrawBounds(
  start: { x: number; y: number },
  end: { x: number; y: number },
  toFlow: (point: { x: number; y: number }) => { x: number; y: number }
) {
  const first = toFlow({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
  });
  const last = toFlow({
    x: Math.max(start.x, end.x),
    y: Math.max(start.y, end.y),
  });
  return {
    position: first,
    size: {
      width: last.x - first.x,
      height: last.y - first.y,
    },
  };
}

export function constrainDrawEnd(
  start: { x: number; y: number },
  end: { x: number; y: number },
  lockAspect: boolean
) {
  if (!lockAspect) return end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + side * (Math.sign(dx) || 1),
    y: start.y + side * (Math.sign(dy) || 1),
  };
}

// Figma-style draw tools cover the flow pane while active so existing nodes
// don't swallow the drawing gesture.
function DrawOverlay({ tool, onDone }: { tool: DrawTool; onDone: () => void }) {
  const { screenToFlowPosition } = useReactFlow();
  const addShapeNode = useFlowStore((s) => s.addShapeNode);
  const addTextNode = useFlowStore((s) => s.addTextNode);
  const addLineNode = useFlowStore((s) => s.addLineNode);
  const setLineEndpointBinding = useFlowStore(
    (s) => s.setLineEndpointBinding
  );
  const selectNodes = useFlowStore((s) => s.selectNodes);
  const ref = useRef<HTMLDivElement>(null);
  const draftRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [draft, setDraft] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(null);
        onDone();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onDone]);

  const toLocal = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toLocal(e);
    const next = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    draftRef.current = next;
    setDraft(next);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draftRef.current) return;
    const p = constrainDrawEnd(
      { x: draftRef.current.x0, y: draftRef.current.y0 },
      toLocal(e),
      e.shiftKey && tool !== "text" && tool !== "line"
    );
    const next = { ...draftRef.current, x1: p.x, y1: p.y };
    draftRef.current = next;
    setDraft(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const current = draftRef.current;
    if (!current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const pointerUp = constrainDrawEnd(
      { x: current.x0, y: current.y0 },
      toLocal(e),
      e.shiftKey && tool !== "text" && tool !== "line"
    );
    const toFlow = (point: { x: number; y: number }) =>
      screenToFlowPosition({
        x: r.left + point.x,
        y: r.top + point.y,
      });
    const { position: start, size } = getDrawBounds(
      { x: current.x0, y: current.y0 },
      pointerUp,
      toFlow
    );
    const origin = toFlow({ x: current.x0, y: current.y0 });
    const dragged =
      Math.abs(pointerUp.x - current.x0) >= 8 &&
      Math.abs(pointerUp.y - current.y0) >= 8;
    const lineDragged =
      Math.hypot(pointerUp.x - current.x0, pointerUp.y - current.y0) >= 8;
    draftRef.current = null;
    setDraft(null);
    let id: string;
    if (tool === "text") {
      id = addTextNode(origin);
    } else if (tool === "line") {
      id = addLineNode(
        origin,
        lineDragged
          ? toFlow(pointerUp)
          : { x: origin.x + 176, y: origin.y }
      );
      const startBinding = findLineBindingAtPoint(
        r.left + current.x0,
        r.top + current.y0
      );
      const endBinding = lineDragged
        ? findLineBindingAtPoint(
            r.left + pointerUp.x,
            r.top + pointerUp.y
          )
        : null;
      if (startBinding) {
        setLineEndpointBinding(id, "start", startBinding);
      }
      if (endBinding) {
        setLineEndpointBinding(id, "end", endBinding);
      }
    } else {
      const shape: ShapeKind = tool === "circle" ? "circle" : "rectangle";
      id = dragged
        ? addShapeNode(shape, start, {
            width: Math.round(size.width),
            height: Math.round(size.height),
          })
        : addShapeNode(shape, {
            x: origin.x - (shape === "circle" ? 110 : 150),
            y: origin.y - (shape === "circle" ? 110 : 100),
          });
    }
    selectNodes([id]);
    onDone();
  };

  const rect = draft
    ? {
        left: Math.min(draft.x0, draft.x1),
        top: Math.min(draft.y0, draft.y1),
        width: Math.abs(draft.x1 - draft.x0),
        height: Math.abs(draft.y1 - draft.y0),
      }
    : null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute inset-0 z-[5] select-none",
        tool === "text" ? "cursor-text" : "cursor-crosshair"
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {draft && tool === "line" && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-primary">
          <defs>
            <marker
              id="line-tool-draft-arrow"
              viewBox="0 0 6 6"
              refX="5.5"
              refY="3"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M 0 0 L 6 3 L 0 6 Z" fill="currentColor" />
            </marker>
          </defs>
          <line
            x1={draft.x0}
            y1={draft.y0}
            x2={draft.x1}
            y2={draft.y1}
            stroke="currentColor"
            strokeWidth="2"
            markerEnd="url(#line-tool-draft-arrow)"
          />
        </svg>
      )}
      {rect && rect.width > 2 && tool !== "text" && tool !== "line" && (
        <div
          className={cn(
            "absolute border border-primary bg-primary/10",
            tool === "circle" ? "rounded-full" : "rounded-sm"
          )}
          style={rect}
        />
      )}
    </div>
  );
}

function VideoFollowOverlay({
  enabled,
  nodes,
  edges,
}: {
  enabled: boolean;
  nodes: readonly AppNode[];
  edges: readonly LabeledEdgeModel[];
}) {
  const { getViewport, setViewport } = useReactFlow();
  const [transport, setTransport] = useState(
    scenarioRuntime.getTransportSnapshot()
  );
  const videoTitle = useFlowStore((state) => state.videoTitle);

  useEffect(() => scenarioRuntime.subscribeTransport(setTransport), []);

  useEffect(() => {
    const visibleNodes = nodes.filter((node) => !node.hidden);
    if (!enabled || !transport.isPlaying || visibleNodes.length === 0) return;
    let animationFrame = 0;
    let previousTime = performance.now();
    let smoothedFocus: { x: number; y: number } | null = null;
    const contentBounds = getNodesBounds(visibleNodes);

    const follow = (time: number) => {
      if (!scenarioRuntime.getTransportSnapshot().isPlaying) return;
      const focus = resolveVideoFollowPoint(
        scenarioRuntime.getActiveTargetFrames(),
        nodes,
        edges
      );
      const flow = document.querySelector(".react-flow");
      if (focus && flow instanceof HTMLElement) {
        const elapsedMs = Math.min(64, time - previousTime);
        smoothedFocus = smoothedFocus
          ? smoothVideoFocusPoint(smoothedFocus, focus, elapsedMs)
          : focus;
        const frame = flow.getBoundingClientRect();
        const current = getViewport();
        const target = getVideoCameraViewport({
          contentBounds,
          viewport: current,
          frame: { width: frame.width, height: frame.height },
          focus: smoothedFocus,
        });
        if (target) {
          const next = smoothVideoViewport(
            current,
            target,
            elapsedMs
          );
          void setViewport(next);
        }
      }
      previousTime = time;
      animationFrame = requestAnimationFrame(follow);
    };

    animationFrame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(animationFrame);
  }, [edges, enabled, getViewport, nodes, setViewport, transport.isPlaying]);

  if (!enabled) return null;
  return (
    <div
      className="pointer-events-none absolute left-4 top-4 z-20 max-w-[min(28rem,calc(100%-2rem))] rounded-lg border border-border/70 bg-background/90 px-3 py-2 shadow-lg backdrop-blur"
      data-video-animation-name
    >
      <p className="truncate text-[13px] font-semibold text-foreground">
        {videoTitle.trim() ||
          scenarioRuntime.getActiveAnimationName() ||
          "No animation selected"}
      </p>
    </div>
  );
}

function CanvasInner() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const deleteElements = useFlowStore((s) => s.deleteElements);
  const addInfraNode = useFlowStore((s) => s.addInfraNode);
  const addShapeNode = useFlowStore((s) => s.addShapeNode);
  const addTextNode = useFlowStore((s) => s.addTextNode);
  const addImageNode = useFlowStore((s) => s.addImageNode);
  const addStepNode = useFlowStore((s) => s.addStepNode);
  const addCodeNode = useFlowStore((s) => s.addCodeNode);
  const customBlocks = useFlowStore((s) => s.customBlocks);
  const insertTemplate = useFlowStore((s) => s.insertTemplate);
  const turbo = useFlowStore((s) => s.turbo);
  const turboColors = useFlowStore((s) => s.turboColors);
  const showControls = useFlowStore((s) => s.showControls);
  const showSmartGuides = useFlowStore((s) => s.showSmartGuides);
  const renderAll = useFlowStore((s) => s.renderAllElements);
  const selectedSingle = useFlowStore((s) => {
    const sel = s.nodes.filter((n) => n.selected);
    return sel.length === 1 ? sel[0] : null;
  });
  const workMode = useFlowStore((s) => s.workMode);
  const previewReturnMode = useFlowStore((s) => s.previewReturnMode);
  const editingTextNodeId = useFlowStore((s) => s.editingTextNodeId);
  const animationPathDraft = useFlowStore((s) => s.animationPathDraft);
  const appendAnimationPathNode = useFlowStore(
    (s) => s.appendAnimationPathNode
  );
  const cancelAnimationPath = useFlowStore((s) => s.cancelAnimationPath);
  const pageBg = useFlowStore(
    (s) => s.pages.find((p) => p.id === s.activePageId)?.bgColor
  );
  const isPreview = workMode === "preview";
  const isVideoPlayback =
    workMode === "video" ||
    (isPreview && previewReturnMode === "video");
  const isPlaybackOnly = isPreview || workMode === "video";
  const isDesign = workMode === "design";
  const isPickingAnimationPath =
    workMode === "animation" && animationPathDraft !== null;
  const { screenToFlowPosition, getZoom } = useReactFlow();

  const [guides, setGuides] = useState<Guide[]>([]);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [altDown, setAltDown] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const activeSnaps = useRef<Map<string, ActiveSnap>>(new Map());
  const elementsInteractive = isCanvasElementInteractionEnabled(
    tool,
    isPlaybackOnly,
    isPickingAnimationPath
  );

  const handleBeforeDelete = useCallback<
    OnBeforeDelete<AppNode, LabeledEdgeModel>
  >(
    async ({ nodes: deletedNodes, edges: deletedEdges }) => {
      deleteElements({
        nodeIds: deletedNodes.map((node) => node.id),
        edgeIds: deletedEdges.map((edge) => edge.id),
      });
      return false;
    },
    [deleteElements]
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.altKey) setAltDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (!e.altKey) setAltDown(false);
    };
    const blur = () => setAltDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useEffect(() => {
    if (!isPickingAnimationPath) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelAnimationPath();
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [cancelAnimationPath, isPickingAnimationPath]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      if (!showSmartGuides) {
        activeSnaps.current.clear();
        onNodesChange(changes);
        return;
      }
      const current = useFlowStore.getState().nodes;
      const positionChanges = changes.filter(
        (c) => c.type === "position" && c.position
      );
      let patched = changes;
      const nextGuides: Guide[] = [];
      if (positionChanges.length === 1) {
        const c = positionChanges[0] as Extract<
          NodeChange<AppNode>,
          { type: "position" }
        >;
        const drag = current.find((n) => n.id === c.id);
        if (drag && c.position) {
          const others = current.filter(
            (n) => n.id !== drag.id && !n.hidden
          );
          const activeSnap = activeSnaps.current.get(drag.id);
          const snap = computeSnap(
            drag,
            c.position,
            others,
            getZoom(),
            activeSnap
          );
          if (c.dragging) {
            activeSnaps.current.set(drag.id, snap.activeSnap);
            nextGuides.push(...snap.guides);
          } else {
            activeSnaps.current.delete(drag.id);
          }
          patched = changes.map((ch) =>
            ch === c
              ? {
                  ...c,
                  position: resolveSnapPosition(
                    c.position!,
                    snap.position,
                    c.dragging !== false
                  ),
                }
              : ch
          );
        }
      }
      const dragEnd = changes.some(
        (c) => c.type === "position" && c.dragging === false
      );
      if (dragEnd) {
        for (const c of changes) {
          if (c.type === "position") {
            activeSnaps.current.delete(c.id);
          }
        }
      }
      if (nextGuides.length === 0 && !dragEnd) {
        if (guides.length > 0 && positionChanges.length === 0) setGuides([]);
      } else if (dragEnd) {
        setGuides([]);
      } else {
        setGuides(nextGuides);
      }
      onNodesChange(patched);
    },
    [onNodesChange, guides.length, showSmartGuides, getZoom]
  );

  const registry = useMemo(
    () => [...CORE_BLOCKS, ...customBlocks],
    [customBlocks]
  );

  const animationPathSteps = useMemo(
    () => {
      const steps = new Map<string, string>();
      (animationPathDraft?.nodeIds ?? []).forEach((id, index) => {
        const step = String(index + 1);
        const previous = steps.get(id);
        steps.set(id, previous ? `${previous}, ${step}` : step);
      });
      return steps;
    },
    [animationPathDraft]
  );
  const animationPathEdgeIds = useMemo(
    () => new Set(animationPathDraft?.edgeIds ?? []),
    [animationPathDraft]
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const pathStep = animationPathSteps.get(node.id);
        const turboOn = (node.data as { turbo?: boolean }).turbo;
        if (!turboOn && pathStep === undefined) return node;
        return {
          ...node,
          className: cn(
            node.className,
            turboOn && "turbo-on",
            pathStep !== undefined && "animation-path-node"
          ),
          ...(pathStep !== undefined
            ? {
                style: {
                  ...node.style,
                  ["--animation-path-step" as string]: `"${pathStep}"`,
                },
              }
            : {}),
        };
      }),
    [animationPathSteps, nodes]
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const inPath = animationPathEdgeIds.has(edge.id);
        if (!edge.data?.turbo && !inPath) return edge;
        return {
          ...edge,
          className: cn(
            edge.className,
            edge.data?.turbo && "turbo-on",
            inPath && "animation-path-edge"
          ),
        };
      }),
    [animationPathEdgeIds, edges]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isDesign) return;
      e.preventDefault();
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      let payload: DragPayload;
      try {
        payload = JSON.parse(raw) as DragPayload;
      } catch {
        return;
      }
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (payload.kind === "infra") {
        const block = registry.find((b) => b.id === payload.blockId);
        if (!block) return;
        addInfraNode(block, position);
      } else if (payload.kind === "template") {
        insertTemplate(payload.templateId, position);
      } else if (payload.kind === "shape") {
        addShapeNode(payload.shape, position);
      } else if (payload.kind === "text") {
        addTextNode(position);
      } else if (payload.kind === "image") {
        addImageNode("", position, { width: 280, height: 180 });
      } else if (payload.kind === "step") {
        addStepNode(position);
      } else if (payload.kind === "code") {
        addCodeNode(position);
      }
    },
    [
      registry,
      screenToFlowPosition,
      addInfraNode,
      insertTemplate,
      addShapeNode,
      addTextNode,
      addImageNode,
      addStepNode,
      addCodeNode,
      isDesign,
    ]
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "labeled",
      animated: false,
      markerEnd: turbo ? undefined : DEFAULT_MARKER,
    }),
    [turbo]
  );

  const [connectPopover, setConnectPopover] = useState<{
    screenX: number;
    screenY: number;
    flowPos: { x: number; y: number };
    sourceId: string;
    sourceHandle: string | null;
    sourcePosition: Position;
  } | null>(null);

  const onConnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      connectionState: FinalConnectionState
    ) => {
      if (connectionState.isValid) return;
      if (!connectionState.fromNode) return;
      const e = event as MouseEvent;
      const clientX = "clientX" in e ? e.clientX : 0;
      const clientY = "clientY" in e ? e.clientY : 0;
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      setConnectPopover({
        screenX: clientX,
        screenY: clientY,
        flowPos,
        sourceId: connectionState.fromNode.id,
        sourceHandle: connectionState.fromHandle?.id ?? null,
        sourcePosition:
          (connectionState.fromHandle?.position as Position) ?? Position.Bottom,
      });
    },
    [screenToFlowPosition]
  );

  useEffect(() => {
    if (!connectPopover) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConnectPopover(null);
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [connectPopover]);

  const pickBlock = useCallback(
    (blockId: string) => {
      if (!connectPopover) return;
      const block = registry.find((b) => b.id === blockId);
      if (!block) return;
      const variant = block.variant ?? "row";
      const size =
        variant === "card"
          ? { w: 220, h: 120 }
          : { w: 240, h: 72 };
      const pos = {
        x: connectPopover.flowPos.x,
        y: connectPopover.flowPos.y - size.h / 2,
      };
      const newId = addInfraNode(block, pos);
      onConnect({
        source: connectPopover.sourceId,
        target: newId,
        sourceHandle: connectPopover.sourceHandle,
        targetHandle: "left",
      });
      setConnectPopover(null);
    },
    [connectPopover, registry, addInfraNode, onConnect]
  );

  const sourceHandlePos = useMemo(() => {
    if (!connectPopover) return null;
    const sel = `.react-flow__node[data-id="${connectPopover.sourceId}"] .react-flow__handle${
      connectPopover.sourceHandle
        ? `[data-handleid="${connectPopover.sourceHandle}"]`
        : ""
    }`;
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [connectPopover]);

  const wrapperStyle = {
    "--turbo-start": turboColors[0],
    "--turbo-end": turboColors[1],
    ...(pageBg ? { "--page-bg": pageBg } : {}),
  } as CSSProperties;

  return (
    <div
      className={cn(
        "relative h-full w-full",
        turbo && "turbo",
        isPreview && "preview-canvas",
        isVideoPlayback && "video-canvas",
        tool === "hand" && "hand-tool",
        tool === "line" && "line-tool-active",
        isPickingAnimationPath && "animation-path-picking"
      )}
      style={wrapperStyle}
      onDrop={isDesign ? onDrop : undefined}
      onDragOver={isDesign ? onDragOver : undefined}
    >
      <TurboDefs colors={turboColors} />
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={isPlaybackOnly ? undefined : handleNodesChange}
        onNodeClick={
          isPickingAnimationPath
            ? (_, node) => appendAnimationPathNode(node.id)
            : undefined
        }
        onNodeMouseEnter={(_, n) => setHoveredId(n.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
        onEdgesChange={isPlaybackOnly ? undefined : onEdgesChange}
        onBeforeDelete={isPlaybackOnly ? undefined : handleBeforeDelete}
        onConnect={isPlaybackOnly ? undefined : onConnect}
        onConnectEnd={isPlaybackOnly ? undefined : onConnectEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={defaultEdgeOptions}
        proOptions={{ hideAttribution: true }}
        selectionOnDrag={
          !isPlaybackOnly && !isPickingAnimationPath && tool === "select"
        }
        panOnDrag={isPlaybackOnly || tool === "hand" ? true : [1]}
        panOnScroll
        selectionMode={SelectionMode.Partial}
        nodesDraggable={elementsInteractive}
        nodesConnectable={elementsInteractive}
        elementsSelectable={elementsInteractive}
        nodesFocusable={elementsInteractive && editingTextNodeId === null}
        edgesFocusable={elementsInteractive}
        deleteKeyCode={
          isPlaybackOnly || isPickingAnimationPath
            ? null
            : ["Backspace", "Delete"]
        }
        onlyRenderVisibleElements={!renderAll}
        elevateNodesOnSelect={false}
        fitView
        fitViewOptions={{ padding: 0.4 }}
      >
      </ReactFlow>
      <VideoFollowOverlay
        enabled={isVideoPlayback}
        nodes={nodes}
        edges={edges}
      />
      {isPickingAnimationPath ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-border bg-background/95 px-3 py-1.5 text-[10px] font-medium text-foreground shadow-lg backdrop-blur">
          Click blocks in request order · Esc to cancel
        </div>
      ) : null}
      {isDesign &&
        (tool === "rect" ||
          tool === "circle" ||
          tool === "line" ||
          tool === "text") && (
        <DrawOverlay tool={tool} onDone={() => setTool("select")} />
      )}
      {isDesign && showControls && (
        <CanvasToolbar tool={tool} onToolChange={setTool} />
      )}
      {isDesign && showSmartGuides && guides.length > 0 && (
        <GuidesOverlay guides={guides} />
      )}
      {isDesign && showSmartGuides && altDown && selectedSingle && (
        <MeasureOverlay
          selected={selectedSingle}
          hoveredId={hoveredId}
          nodes={nodes}
        />
      )}
      {!isPlaybackOnly && connectPopover && (
        <>
          {sourceHandlePos && (
            <svg className="pointer-events-none fixed inset-0 z-40 h-full w-full">
              <path
                d={(() => {
                  const sx = sourceHandlePos.x;
                  const sy = sourceHandlePos.y;
                  const ex = connectPopover.screenX;
                  const ey = connectPopover.screenY;
                  const opposite: Record<Position, Position> = {
                    [Position.Top]: Position.Bottom,
                    [Position.Bottom]: Position.Top,
                    [Position.Left]: Position.Right,
                    [Position.Right]: Position.Left,
                  };
                  const [d] = getBezierPath({
                    sourceX: sx,
                    sourceY: sy,
                    targetX: ex,
                    targetY: ey,
                    sourcePosition: connectPopover.sourcePosition,
                    targetPosition: opposite[connectPopover.sourcePosition],
                    curvature: 0.4,
                  });
                  return d;
                })()}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <circle
                cx={connectPopover.screenX}
                cy={connectPopover.screenY}
                r={4}
                fill="hsl(var(--muted-foreground))"
              />
            </svg>
          )}
          <div
            className="fixed inset-0 z-40"
            onMouseDown={() => setConnectPopover(null)}
          />
          <div
            className="fixed z-50 flex w-80 max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xl border border-border/60 bg-popover p-2 shadow-xl"
            style={{
              ...getConnectPickerPosition(
                { x: connectPopover.screenX, y: connectPopover.screenY },
                { width: window.innerWidth, height: window.innerHeight }
              ),
              maxHeight: "min(400px, calc(100vh - 16px))",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="px-2 pb-1.5 pt-0.5 text-xs font-semibold text-muted-foreground/90">
              Connect to…
            </p>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0.5 overflow-y-auto">
              {registry.map((b) => {
                const Ic = resolveIcon(b.iconName);
                const accent = ACCENT_CLASSES[b.accent];
                const hasIcon = !!(b.customIcon || b.iconName);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => pickBlock(b.id)}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg",
                        !b.customIcon && accent.tile
                      )}
                    >
                      {b.customIcon ? (
                        <img
                          src={b.customIcon}
                          alt=""
                          className="h-5 w-5 object-contain"
                        />
                      ) : hasIcon ? (
                        <Ic className={cn("h-4 w-4", accent.icon)} />
                      ) : (
                        <span className={cn("h-2.5 w-2.5 rounded-full", accent.dot)} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground/80">
                      {b.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Canvas() {
  return <CanvasInner />;
}
