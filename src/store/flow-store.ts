import { create } from "zustand";
import {
  persist,
  type PersistStorage,
  type StorageValue,
} from "zustand/middleware";
import { temporal } from "zundo";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import {
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  MarkerType,
  type Edge,
  type EdgeMarker,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { CORE_BLOCKS, type Accent, type BlockDef } from "@/blocks/registry";
import type { IconName } from "@/blocks/icons";
import { lineGeometryFromPoints } from "@/lib/line-geometry";
import { syncBoundLines } from "@/lib/line-bindings";
import type {
  PageScenarioDocumentV1,
  ScenarioEffectV1,
  ScenarioV1,
} from "@/animation/model";
import {
  applyEdgeEffect,
  applyNodeEffect,
  cloneScenarioTargets,
  createDefaultScenarioDocument,
  createEmptyScenarioDocument,
  patchEdgeEffects,
  pruneScenarioTargets,
  removeEdgeEffects,
  removeNodeEffects,
  type ScenarioClipPatchV1,
} from "@/animation/scenario-document";
import {
  clearLegacyAnimatedFlags,
  migrateFlowSnapshotV1,
  type FlowSnapshotV2,
} from "@/animation/snapshot-migrations";
import {
  getDefaultScenario,
  prefersReducedMotion,
  scenarioRuntime,
} from "@/animation/runtime-instance";
import {
  createGradientBeamClip,
  createGradientBeamEffect,
  createNodeBorderClip,
  createNodeBorderEffect,
  GRADIENT_BEAM_DURATION_MS,
  normalizeGradientBeamDefaults,
  REQUEST_FLOW_ARRIVAL_LEAD_MS,
  REQUEST_FLOW_EDGE_DELAY_MS,
  REQUEST_FLOW_HOP_DELAY_MS,
  type NodeBorderEntrySide,
} from "@/animation/gradient-beam";
import {
  findAuthoredCustomPaths,
  type AnimationPathPreset,
} from "@/animation/custom-path";
import {
  buildRequestFlow,
  buildSelectedRequestFlow,
} from "@/animation/request-flow";
import { findTemplate, TEMPLATES } from "@/templates/registry";

export type InfraVariant = "row" | "card";
export type IconPosition = "left" | "right" | "top" | "bottom";
export type TextAlign = "left" | "center" | "right";

// `name` is the layer's display name (renamed from the Layers panel),
// kept separate from content fields like `label` so a rename doesn't put
// text on the shape or overwrite the inspector's Label field.
type WithGroup = { groupId?: string | null; name?: string };
type WithColors = {
  bgColor?: string;
  titleColor?: string;
  subtitleColor?: string;
  borderColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  turbo?: boolean;
};
type WithRotation = { rotation?: number };

export type InfraNodeData = WithGroup &
  WithColors & {
    blockId: string;
    label: string;
    subtitle?: string;
    iconName?: IconName;
    accent?: Accent;
    variant?: InfraVariant;
    iconPosition?: IconPosition;
    textAlign?: TextAlign;
    customIcon?: string;
  };
export type InfraNode = Node<InfraNodeData, "infra">;

export type ShapeKind = "rectangle" | "circle";
export type BorderStyle = "solid" | "dashed" | "dotted";
export type ShapeNodeData = WithGroup &
  WithColors &
  WithRotation & {
    shape: ShapeKind;
    label?: string;
    accent?: Accent;
    borderStyle?: BorderStyle;
  };
export type ShapeNode = Node<ShapeNodeData, "shape">;

export type TextNodeData = WithGroup &
  WithColors &
  WithRotation & {
    text: string;
    accent?: Accent;
    fontSize?: number;
  };
export type TextNode = Node<TextNodeData, "text">;

export type StepNodeData = WithGroup &
  WithColors & {
    step: number;
    label?: string;
    accent?: Accent;
  };
export type StepNode = Node<StepNodeData, "step">;

export type LineDirection = "tl-br" | "tr-bl" | "l-r" | "t-b";
export type ArrowShape = "none" | "triangle" | "open" | "diamond" | "circle";
export type LinePoint = { x: number; y: number };
export type LineBindingHandle = "top" | "right" | "bottom" | "left";
export type LineBinding = {
  nodeId: string;
  handleId: LineBindingHandle;
};
export type LineNodeData = WithGroup & {
  direction?: LineDirection;
  curvature?: number;
  rotation?: number;
  start?: LinePoint;
  end?: LinePoint;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  arrowStartShape?: ArrowShape;
  arrowEndShape?: ArrowShape;
  strokeColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
  startBinding?: LineBinding;
  endBinding?: LineBinding;
};
export type LineNode = Node<LineNodeData, "line">;

export type ImageNodeData = WithGroup &
  WithColors & {
    src: string;
    fit?: "contain" | "cover" | "fill";
    scale?: number;
    opacity?: number;
    borderStyle?: BorderStyle;
  };
export type ImageNode = Node<ImageNodeData, "image">;

export type CodeLanguage =
  | "plaintext"
  | "bash"
  | "javascript"
  | "typescript"
  | "tsx"
  | "jsx"
  | "json"
  | "yaml"
  | "python"
  | "go"
  | "sql"
  | "html"
  | "css"
  | "markdown";

export type CodeNodeData = WithGroup &
  WithColors & {
    code: string;
    language: CodeLanguage;
    label?: string;
  };
export type CodeNode = Node<CodeNodeData, "code">;

export type AppNode =
  | InfraNode
  | ShapeNode
  | TextNode
  | StepNode
  | LineNode
  | ImageNode
  | CodeNode;

export type Group = {
  id: string;
  name: string;
  parentGroupId: string | null;
  collapsed?: boolean;
};

export type Page = { id: string; name: string; bgColor?: string };
export type CanvasViewport = { x: number; y: number; zoom: number };
export type PageContent = {
  nodes: AppNode[];
  edges: LabeledEdge[];
  groups: Group[];
  scenarioDocument: PageScenarioDocumentV1;
};

export type EdgeLineStyle = "solid" | "dashed" | "dotted";
export type EdgeCurveStyle = "stepped" | "smooth";
export type LabeledEdgeData = {
  label?: string;
  turbo?: boolean;
  color?: string;
  lineStyle?: EdgeLineStyle;
  curveStyle?: EdgeCurveStyle;
  dashGap?: number;
  labelTextColor?: string;
  labelBgColor?: string;
  labelBorderColor?: string;
};
export type LabeledEdge = Edge<LabeledEdgeData, "labeled">;

export const DEFAULT_MARKER: EdgeMarker = {
  type: MarkerType.ArrowClosed,
  width: 18,
  height: 18,
  color: "#94a3b8",
};

const edgeMarker = (color?: string): EdgeMarker => ({
  ...DEFAULT_MARKER,
  color: color ?? DEFAULT_MARKER.color,
});

const normalizeEdgeAppearance = (edges: readonly LabeledEdge[]) =>
  clearLegacyAnimatedFlags(edges).map((edge) => ({
    ...edge,
    markerEnd: edge.data?.turbo ? undefined : edgeMarker(edge.data?.color),
  }));

export const DEFAULT_TURBO_COLORS: [string, string] = ["#ec4899", "#3b82f6"];

type Snapshot = {
  projectName: string;
  nodes: AppNode[];
  edges: LabeledEdge[];
  customBlocks: BlockDef[];
  groups: Group[];
  pages: Page[];
  activePageId: string;
  // Content of every page except the active one (active lives in
  // nodes/edges/groups above).
  pageContents: Record<string, PageContent>;
  scenarioDocument: PageScenarioDocumentV1;
  turbo: boolean;
  turboColors: [string, string];
  edgeColor?: string;
  edgeCurveStyle: EdgeCurveStyle;
  edgeLineStyle: EdgeLineStyle;
  edgeDashGap: number;
  showControls: boolean;
  showSmartGuides: boolean;
  motionPreference: MotionPreference;
  videoTitle: string;
  videoStartDelayMs: number;
  videoBetweenDelayMs: number;
  videoEndDelayMs: number;
  videoCameraFollowEnabled: boolean;
  workMode: WorkMode;
  canvasViewport: CanvasViewport | null;
  renderAllElements: boolean;
  setRenderAllElements: (v: boolean) => void;
};

export type WorkMode = "design" | "animation" | "video" | "preview";
export type EditorMode = Exclude<WorkMode, "preview">;
export const isAnimationCanvasMode = (mode: WorkMode) => mode !== "design";
export type MotionPreference = "system" | "full" | "reduced";
const MAX_VIDEO_DELAY_MS = 10_000;
const normalizeVideoDelay = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(MAX_VIDEO_DELAY_MS, Math.max(0, Math.round(value)))
    : fallback;
export type AnimationPathAppearance = {
  colors: [string, string];
  responseColors: [string, string];
  widthPx: number;
  beamLengthPx: number;
  opacity: number;
  glowBlurPx: number;
  shimmer: boolean;
};
export type AnimationPathDraft = {
  scenarioId: string | null;
  name: string;
  preset: AnimationPathPreset;
  staggerMs: number;
  appearance: AnimationPathAppearance;
  nodeIds: string[];
  edgeIds: string[];
  error: string | null;
};

type NodeDataPatch = Partial<InfraNodeData> &
  Partial<ShapeNodeData> &
  Partial<TextNodeData> &
  Partial<CodeNodeData> &
  Partial<StepNodeData> &
  Partial<LineNodeData> &
  Partial<ImageNodeData>;

type FlowState = Snapshot & {
  previewReturnMode: EditorMode;
  animationPathDraft: AnimationPathDraft | null;
  editingTextNodeId: string | null;
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange<LabeledEdge>;
  onConnect: OnConnect;
  addInfraNode: (block: BlockDef, position: { x: number; y: number }) => string;
  addShapeNode: (
    shape: ShapeKind,
    position: { x: number; y: number },
    size?: { width: number; height: number }
  ) => string;
  addTextNode: (position: { x: number; y: number }) => string;
  setEditingTextNode: (id: string | null) => void;
  addCodeNode: (position: { x: number; y: number }) => void;
  addStepNode: (position: { x: number; y: number }) => void;
  addLineNode: (start: LinePoint, end?: LinePoint) => string;
  updateLineGeometry: (
    id: string,
    geometry: {
      position: LinePoint;
      width: number;
      height: number;
      start: LinePoint;
      end: LinePoint;
    }
  ) => void;
  setLineEndpointBinding: (
    id: string,
    endpoint: "start" | "end",
    binding: LineBinding | null
  ) => void;
  addImageNode: (
    src: string,
    position: { x: number; y: number },
    size: { width: number; height: number }
  ) => string;
  insertTemplate: (
    templateId: string,
    position: { x: number; y: number }
  ) => void;
  updateNodeData: (id: string, patch: NodeDataPatch) => void;
  duplicateNodes: (
    ids: string[],
    offset?: { x: number; y: number }
  ) => void;
  updateEdgeLabel: (id: string, label: string) => void;
  setEdgeLabel: (label: string) => void;
  renameNode: (id: string, name: string) => void;
  deleteNode: (id: string) => void;
  selectNodes: (ids: string[]) => void;
  toggleNodeSelection: (id: string) => void;
  toggleNodeHidden: (id: string) => void;
  toggleNodeLocked: (id: string) => void;
  toggleGroupHidden: (id: string) => void;
  toggleGroupLocked: (id: string) => void;
  addCustomBlock: (block: Omit<BlockDef, "id" | "builtin">) => BlockDef;
  deleteCustomBlock: (id: string) => void;
  toggleTurbo: () => void;
  setTurboColor: (index: 0 | 1, color: string) => void;
  setEdgeColor: (color: string | undefined) => void;
  setEdgeCurveStyle: (style: EdgeCurveStyle) => void;
  setEdgeLabelColor: (
    key: "text" | "bg" | "border",
    color: string | undefined
  ) => void;
  setEdgeLineStyle: (style: EdgeLineStyle) => void;
  setEdgeDashGap: (gap: number) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  groupSelected: () => void;
  createGroup: (parentGroupId?: string | null) => string;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  moveNodeToGroup: (nodeId: string, groupId: string | null) => void;
  moveGroupToGroup: (id: string, parentGroupId: string | null) => void;
  moveNodeBefore: (
    nodeId: string,
    beforeNodeId: string | null,
    groupId: string | null
  ) => void;
  moveGroupBefore: (
    groupId: string,
    beforeGroupId: string | null,
    parentGroupId: string | null
  ) => void;
  setProjectName: (name: string) => void;
  setPageBackground: (color: string | undefined) => void;
  addPage: () => string;
  renamePage: (id: string, name: string) => void;
  deletePage: (id: string) => void;
  setActivePage: (id: string) => void;
  clear: () => void;
  resetWorkspace: () => Promise<void>;
  replaceDocument: (snapshot: FlowSnapshotV2) => void;
  applySelectedEdgeEffect: (
    effect: ScenarioEffectV1,
    clip?: ScenarioClipPatchV1
  ) => void;
  patchSelectedEdgeEffects: (patch: ScenarioClipPatchV1) => void;
  removeSelectedEdgeEffects: () => void;
  animateAllEdges: () => void;
  animateRequestFlow: (startNodeId: string) => void;
  animateSelectedPath: () => void;
  beginAnimationPath: (startNodeId?: string) => void;
  setAnimationPathName: (name: string) => void;
  setAnimationPathPreset: (preset: AnimationPathPreset) => void;
  setAnimationPathStaggerMs: (staggerMs: number) => void;
  setAnimationPathAppearance: (
    patch: Partial<AnimationPathAppearance>
  ) => void;
  appendAnimationPathNode: (nodeId: string) => void;
  undoAnimationPathNode: () => void;
  cancelAnimationPath: () => void;
  editAnimationPath: (scenarioId?: string) => void;
  activateAnimationPath: (scenarioId: string) => void;
  reorderAnimationPath: (
    scenarioId: string,
    beforeScenarioId: string | null
  ) => void;
  deleteAnimationPath: (scenarioId: string) => void;
  animateDraftPath: () => void;
  deleteElements: (input: ElementDeletionInput) => void;
  selectAll: () => void;
  deleteSelected: () => void;
  toggleControls: () => void;
  toggleSmartGuides: () => void;
  setMotionPreference: (preference: MotionPreference) => void;
  setVideoTitle: (title: string) => void;
  setVideoStartDelayMs: (delayMs: number) => void;
  setVideoBetweenDelayMs: (delayMs: number) => void;
  setVideoEndDelayMs: (delayMs: number) => void;
  setVideoCameraFollowEnabled: (enabled: boolean) => void;
  setCanvasViewport: (viewport: CanvasViewport) => void;
  setWorkMode: (mode: WorkMode) => void;
  exitPreview: () => void;
};

let nodeSeq = 0;
const nextNodeId = () =>
  `n${Date.now().toString(36)}${(nodeSeq++).toString(36)}`;
const nextGroupId = () =>
  `g${Date.now().toString(36)}${(nodeSeq++).toString(36)}`;
let edgeSeq = 0;
const nextEdgeId = () =>
  `e${Date.now().toString(36)}${(edgeSeq++).toString(36)}`;
const nextBlockId = () => `custom-${Math.random().toString(36).slice(2, 10)}`;
const nextPageId = () =>
  `p${Date.now().toString(36)}${(nodeSeq++).toString(36)}`;

const nodeEntrySide = (
  edge?: LabeledEdge,
  direction: "forward" | "reverse" = "forward"
): NodeBorderEntrySide => {
  const side = direction === "reverse" ? edge?.sourceHandle : edge?.targetHandle;
  return side === "top" ||
    side === "right" ||
    side === "bottom" ||
    side === "left"
    ? side
    : "left";
};

const defaultAnimationPathAppearance = (): AnimationPathAppearance => ({
  colors: ["#ffaa40", "#9c40ff"],
  responseColors: ["#38bdf8", "#818cf8"],
  widthPx: 2,
  beamLengthPx: 48,
  opacity: 1,
  glowBlurPx: 0,
  shimmer: true,
});

function animationPathAppearance(
  document: PageScenarioDocumentV1,
  scenarioId: string
): AnimationPathAppearance {
  const defaults = defaultAnimationPathAppearance();
  const scenario = document.scenarios.find(
    (candidate) => candidate.id === scenarioId
  );
  const clips =
    scenario?.tracks
      .filter((track) => track.property === "connection-effect")
      .flatMap((track) =>
        track.clips.filter(
          (candidate) => candidate.effect.type === "edge.gradient-beam"
        )
      ) ?? [];
  const clip = clips.find(
    (candidate) => candidate.effect.params.direction !== "reverse"
  ) ?? clips[0];
  if (!clip) return defaults;
  const params = clip.effect.params;
  const colors = params.colors;
  const responseColors = clips.find(
    (candidate) => candidate.effect.params.direction === "reverse"
  )?.effect.params.colors;
  return {
    colors:
      Array.isArray(colors) &&
      typeof colors[0] === "string" &&
      typeof colors[1] === "string"
        ? [colors[0], colors[1]]
        : defaults.colors,
    responseColors:
      Array.isArray(responseColors) &&
      typeof responseColors[0] === "string" &&
      typeof responseColors[1] === "string"
        ? [responseColors[0], responseColors[1]]
        : defaults.responseColors,
    widthPx:
      typeof params.widthPx === "number" ? params.widthPx : defaults.widthPx,
    beamLengthPx:
      typeof params.beamLengthPx === "number"
        ? params.beamLengthPx
        : defaults.beamLengthPx,
    opacity:
      typeof params.opacity === "number" ? params.opacity : defaults.opacity,
    glowBlurPx:
      typeof params.glowBlurPx === "number"
        ? params.glowBlurPx
        : defaults.glowBlurPx,
    shimmer:
      scenario?.tracks.some(
        (track) =>
          track.property === "node-effect" &&
          track.clips.some(
            (candidate) => candidate.effect.type === "node.border-beam"
          )
      ) ?? defaults.shimmer,
  };
}

function buildAnimationPathScenario(input: {
  id?: string;
  name: string;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  edges: readonly LabeledEdge[];
  appearance: AnimationPathAppearance;
  preset?: AnimationPathPreset;
  staggerMs?: number;
}): ScenarioV1 | null {
  const preset = input.preset ?? "single-line";
  const edgeCount = input.edgeIds.length;
  const workerCount = input.nodeIds.length - 2;
  const valid =
    preset === "bidirectional"
      ? edgeCount === 1
      : preset === "failover"
        ? edgeCount === 2
        : preset === "scatter-gather"
          ? workerCount >= 2 && edgeCount === workerCount * 2
          : preset === "loop"
            ? edgeCount >= 2 &&
              input.nodeIds[0] === input.nodeIds[input.nodeIds.length - 1]
            : preset === "multiple-inputs" ||
                preset === "multiple-outputs" ||
                preset === "round-robin" ||
                preset === "staggered-outputs" ||
                preset === "cascade"
              ? edgeCount >= 2
              : edgeCount >= 1;
  if (!valid) return null;

  let document = createDefaultScenarioDocument({
    id: input.id,
    name: input.name,
  });

  const edgeById = (edgeId: string) =>
    input.edges.find((edge) => edge.id === edgeId);
  const addEdge = (
    edgeId: string,
    startMs: number,
    options: {
      direction?: "forward" | "reverse" | "bidirectional";
      colors?: [string, string];
      phase?: string;
      append?: boolean;
    } = {}
  ) => {
    const effect = createGradientBeamEffect();
    effect.params = {
      ...effect.params,
      colors: [...(options.colors ?? input.appearance.colors)],
      widthPx: input.appearance.widthPx,
      beamLengthPx: input.appearance.beamLengthPx,
      opacity: input.appearance.opacity,
      glowBlurPx: input.appearance.glowBlurPx,
      pathPreset: preset,
      direction: options.direction ?? "forward",
      ...(options.phase ? { pathPhase: options.phase } : {}),
      ...(preset === "multiple-outputs" || preset === "staggered-outputs"
        ? {
            staggerMs:
              input.staggerMs ?? (preset === "staggered-outputs" ? 300 : 0),
          }
        : {}),
    };
    document = applyEdgeEffect(document, {
      edgeIds: [edgeId],
      effect,
      append: options.append,
      clip: createGradientBeamClip(startMs),
    });
  };
  const addShimmer = (
    nodeId: string | undefined,
    startMs: number,
    edge?: LabeledEdge,
    colors: [string, string] = input.appearance.colors,
    direction: "forward" | "reverse" = "forward"
  ) => {
    if (!input.appearance.shimmer || !nodeId) return;
    const effect = createNodeBorderEffect(nodeEntrySide(edge, direction));
    effect.params = { ...effect.params, colors: [...colors] };
    document = applyNodeEffect(document, {
      nodeIds: [nodeId],
      effect,
      append: true,
      clip: createNodeBorderClip(startMs),
    });
  };
  const edgeStart = (index: number) =>
    input.appearance.shimmer
      ? REQUEST_FLOW_EDGE_DELAY_MS + index * REQUEST_FLOW_HOP_DELAY_MS
      : index * GRADIENT_BEAM_DURATION_MS;

  if (preset === "single-line" || preset === "loop") {
    input.edgeIds.forEach((edgeId, index) => addEdge(edgeId, edgeStart(index)));
    input.nodeIds.forEach((nodeId, index) =>
      addShimmer(
        nodeId,
        index * REQUEST_FLOW_HOP_DELAY_MS,
        index === 0 ? undefined : edgeById(input.edgeIds[index - 1])
      )
    );
  } else if (preset === "request-response") {
    input.edgeIds.forEach((edgeId, index) => addEdge(edgeId, edgeStart(index)));
    input.nodeIds.forEach((nodeId, index) =>
      addShimmer(
        nodeId,
        index * REQUEST_FLOW_HOP_DELAY_MS,
        index === 0 ? undefined : edgeById(input.edgeIds[index - 1])
      )
    );
    const responseStart = input.appearance.shimmer
      ? edgeCount * REQUEST_FLOW_HOP_DELAY_MS + REQUEST_FLOW_EDGE_DELAY_MS
      : edgeCount * GRADIENT_BEAM_DURATION_MS;
    [...input.edgeIds].reverse().forEach((edgeId, index) => {
      const startMs = responseStart + index * REQUEST_FLOW_HOP_DELAY_MS;
      const edge = edgeById(edgeId);
      addEdge(edgeId, startMs, {
        direction: "reverse",
        colors: input.appearance.responseColors,
        phase: "response",
        append: true,
      });
      addShimmer(
        edge?.source,
        startMs + GRADIENT_BEAM_DURATION_MS - REQUEST_FLOW_ARRIVAL_LEAD_MS,
        edge,
        input.appearance.responseColors,
        "reverse"
      );
    });
  } else if (preset === "bidirectional") {
    addEdge(
      input.edgeIds[0],
      input.appearance.shimmer ? REQUEST_FLOW_EDGE_DELAY_MS : 0,
      {
        direction: "bidirectional",
      }
    );
    input.nodeIds.forEach((nodeId) => addShimmer(nodeId, 0));
  } else if (preset === "multiple-inputs") {
    input.edgeIds.forEach((edgeId) =>
      addEdge(
        edgeId,
        input.appearance.shimmer ? REQUEST_FLOW_EDGE_DELAY_MS : 0
      )
    );
    addShimmer(
      input.nodeIds[0],
      REQUEST_FLOW_HOP_DELAY_MS,
      edgeById(input.edgeIds[0])
    );
    input.nodeIds.slice(1).forEach((nodeId) => addShimmer(nodeId, 0));
  } else if (
    preset === "multiple-outputs" ||
    preset === "staggered-outputs"
  ) {
    const staggerMs =
      input.staggerMs ?? (preset === "staggered-outputs" ? 300 : 0);
    addShimmer(input.nodeIds[0], 0);
    input.edgeIds.forEach((edgeId, index) => {
      const startMs =
        (input.appearance.shimmer ? REQUEST_FLOW_EDGE_DELAY_MS : 0) +
        index * staggerMs;
      addEdge(edgeId, startMs);
      addShimmer(
        input.nodeIds[index + 1],
        staggerMs === 0
          ? REQUEST_FLOW_HOP_DELAY_MS
          : startMs +
              GRADIENT_BEAM_DURATION_MS -
              REQUEST_FLOW_ARRIVAL_LEAD_MS,
        edgeById(edgeId)
      );
    });
  } else if (preset === "scatter-gather") {
    const scatterEdges = input.edgeIds.slice(0, workerCount);
    const gatherEdges = input.edgeIds.slice(workerCount);
    scatterEdges.forEach((edgeId) =>
      addEdge(
        edgeId,
        input.appearance.shimmer ? REQUEST_FLOW_EDGE_DELAY_MS : 0,
        { phase: "scatter" }
      )
    );
    gatherEdges.forEach((edgeId) =>
      addEdge(
        edgeId,
        input.appearance.shimmer
          ? REQUEST_FLOW_EDGE_DELAY_MS + REQUEST_FLOW_HOP_DELAY_MS
          : GRADIENT_BEAM_DURATION_MS,
        { phase: "gather" }
      )
    );
    addShimmer(input.nodeIds[0], 0);
    input.nodeIds.slice(1, -1).forEach((nodeId, index) =>
      addShimmer(
        nodeId,
        REQUEST_FLOW_HOP_DELAY_MS,
        edgeById(scatterEdges[index])
      )
    );
    addShimmer(
      input.nodeIds[input.nodeIds.length - 1],
      REQUEST_FLOW_HOP_DELAY_MS * 2,
      edgeById(gatherEdges[0])
    );
  } else if (preset === "round-robin") {
    addShimmer(input.nodeIds[0], 0);
    input.edgeIds.forEach((edgeId, index) => {
      const startMs = edgeStart(index);
      addEdge(edgeId, startMs);
      addShimmer(
        input.nodeIds[index + 1],
        startMs + GRADIENT_BEAM_DURATION_MS - REQUEST_FLOW_ARRIVAL_LEAD_MS,
        edgeById(edgeId)
      );
    });
  } else if (preset === "failover") {
    const starts = input.appearance.shimmer
      ? [
          REQUEST_FLOW_EDGE_DELAY_MS,
          REQUEST_FLOW_EDGE_DELAY_MS + REQUEST_FLOW_HOP_DELAY_MS,
        ]
      : [0, GRADIENT_BEAM_DURATION_MS];
    addShimmer(input.nodeIds[0], 0);
    input.edgeIds.forEach((edgeId, index) => addEdge(edgeId, starts[index]));
    addShimmer(
      input.nodeIds[1],
      REQUEST_FLOW_HOP_DELAY_MS,
      edgeById(input.edgeIds[0]),
      ["#fb7185", "#ef4444"]
    );
    addShimmer(
      input.nodeIds[2],
      REQUEST_FLOW_HOP_DELAY_MS * 2,
      edgeById(input.edgeIds[1])
    );
  } else if (preset === "cascade") {
    const hops = new Map<string, number>([[input.nodeIds[0] ?? "", 0]]);
    addShimmer(input.nodeIds[0], 0);
    input.edgeIds.forEach((edgeId) => {
      const edge = edgeById(edgeId);
      if (!edge) return;
      const sourceHop = hops.get(edge.source) ?? 0;
      const targetHop = sourceHop + 1;
      hops.set(edge.target, targetHop);
      addEdge(
        edgeId,
        input.appearance.shimmer
          ? REQUEST_FLOW_EDGE_DELAY_MS +
            sourceHop * REQUEST_FLOW_HOP_DELAY_MS
          : sourceHop * GRADIENT_BEAM_DURATION_MS
      );
      addShimmer(edge.target, targetHop * REQUEST_FLOW_HOP_DELAY_MS, edge);
    });
  }

  return document.scenarios[0] ?? null;
}

function buildSequentialPreviewScenario(
  name: string,
  scenarios: readonly ScenarioV1[]
): ScenarioV1 | null {
  if (scenarios.length < 2) return null;
  const gapMs = 400;
  let offsetMs = 0;
  const tracks = scenarios.flatMap((scenario, index) => {
    const shifted = scenario.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({
        ...clip,
        startMs: clip.startMs + offsetMs,
      })),
    }));
    offsetMs += scenario.durationMs;
    if (index < scenarios.length - 1) offsetMs += gapMs;
    return shifted;
  });
  const base = createDefaultScenarioDocument({ name }).scenarios[0];
  if (!base) return null;
  return {
    ...base,
    durationMs: offsetMs,
    playback: {
      ...base.playback,
      loop: { mode: "repeat", startMs: 0, endMs: offsetMs },
    },
    tracks,
  };
}

function ensureTemplatePreviewScenarios(
  document: PageScenarioDocumentV1
): PageScenarioDocumentV1 {
  let next = document;
  for (const template of TEMPLATES) {
    if (
      !template.previewName ||
      next.scenarios.some((scenario) => scenario.name === template.previewName)
    ) {
      continue;
    }
    const paths = template.animations.map((animation) =>
      next.scenarios.find((scenario) => scenario.name === animation.name)
    );
    if (paths.some((scenario) => !scenario)) continue;
    const preview = buildSequentialPreviewScenario(
      template.previewName,
      paths as ScenarioV1[]
    );
    if (!preview) continue;
    const replacesDefault = paths.some(
      (scenario) => scenario?.id === next.defaultScenarioId
    );
    next = {
      ...next,
      scenarios: [preview, ...next.scenarios],
      defaultScenarioId: replacesDefault ? preview.id : next.defaultScenarioId,
    };
  }
  return next;
}

function activateScenarioForEdges(
  document: PageScenarioDocumentV1,
  edgeIds: readonly string[]
): PageScenarioDocumentV1 {
  if (edgeIds.length === 0) return document;
  const containsEveryEdge = (
    scenario: PageScenarioDocumentV1["scenarios"][number]
  ) =>
    edgeIds.every((edgeId) =>
      scenario.tracks.some(
        (track) =>
          track.enabled &&
          track.property === "connection-effect" &&
          track.target.type === "edge" &&
          "id" in track.target &&
          track.target.id === edgeId
      )
    );
  const current = document.scenarios.find(
    (scenario) => scenario.id === document.defaultScenarioId
  );
  if (current && containsEveryEdge(current)) return document;
  const matching = document.scenarios.find(containsEveryEdge);
  return matching
    ? { ...document, defaultScenarioId: matching.id }
    : document;
}

const createEmptyPageContent = (): PageContent => ({
  nodes: [],
  edges: [],
  groups: [],
  scenarioDocument: createEmptyScenarioDocument(),
});

// Page switches swap nodes/edges/groups wholesale; recording that in the
// undo stack would let undo leak one page's content into another.
function withHistoryReset(fn: () => void) {
  const t = useFlowStore.temporal.getState();
  t.pause();
  fn();
  t.clear();
  t.resume();
}

type ElementDeletionInput = {
  nodeIds?: readonly string[];
  edgeIds?: readonly string[];
  groupIds?: readonly string[];
};

function deleteAuthoredElements(
  state: Pick<Snapshot, "nodes" | "edges" | "groups" | "scenarioDocument">,
  input: ElementDeletionInput
) {
  const nodeIds = new Set(input.nodeIds ?? []);
  const groupIds = new Set(input.groupIds ?? []);
  const edgeIds = new Set(input.edgeIds ?? []);
  for (const edge of state.edges) {
    if (nodeIds.has(edge.source) || nodeIds.has(edge.target)) {
      edgeIds.add(edge.id);
    }
  }
  return {
    nodes: state.nodes
      .filter((node) => !nodeIds.has(node.id))
      .map((node) => {
        if (node.type !== "line") return node;
        const startBinding = node.data.startBinding;
        const endBinding = node.data.endBinding;
        if (
          !nodeIds.has(startBinding?.nodeId ?? "") &&
          !nodeIds.has(endBinding?.nodeId ?? "")
        ) {
          return node;
        }
        return {
          ...node,
          data: {
            ...node.data,
            startBinding:
              startBinding && nodeIds.has(startBinding.nodeId)
                ? undefined
                : startBinding,
            endBinding:
              endBinding && nodeIds.has(endBinding.nodeId)
                ? undefined
                : endBinding,
          },
        };
      }),
    edges: state.edges.filter((edge) => !edgeIds.has(edge.id)),
    groups: state.groups.filter((group) => !groupIds.has(group.id)),
    scenarioDocument: pruneScenarioTargets(state.scenarioDocument, [
      ...[...nodeIds].map((id) => ({ type: "node", id } as const)),
      ...[...edgeIds].map((id) => ({ type: "edge", id } as const)),
      ...[...groupIds].map((id) => ({ type: "group", id } as const)),
    ]),
  };
}

// Per-node identity fields that must NOT be broadcast across a
// multi-selection when editing shared style in the inspector.
const IDENTITY_KEYS = new Set([
  "label",
  "subtitle",
  "text",
  "code",
  "step",
  "src",
]);

const infraSize = (variant: InfraVariant) =>
  variant === "card" ? { width: 180, height: 150 } : { width: 220, height: 72 };

// Renaming a layer sets its dedicated `name` — never the content fields.
function renamedData(node: AppNode, name: string): AppNode["data"] {
  return { ...node.data, name } as AppNode["data"];
}

// Reorder the given node ids among their group siblings within the flat
// nodes array, keeping non-siblings in place. Works for a whole selection:
// front/back move the selected as a block; forward/backward step them one
// slot past their unselected neighbours. React Flow paints later-in-array
// on top, and the Layers panel mirrors array order.
type OrderMode = "front" | "back" | "forward" | "backward";
function reorderSiblings(
  sibs: AppNode[],
  sel: Set<string>,
  mode: OrderMode
): AppNode[] {
  if (mode === "front") {
    return [...sibs.filter((n) => !sel.has(n.id)), ...sibs.filter((n) => sel.has(n.id))];
  }
  if (mode === "back") {
    return [...sibs.filter((n) => sel.has(n.id)), ...sibs.filter((n) => !sel.has(n.id))];
  }
  const next = [...sibs];
  if (mode === "forward") {
    // Move selected toward the end (front), past unselected neighbours.
    for (let i = next.length - 2; i >= 0; i--) {
      if (sel.has(next[i].id) && !sel.has(next[i + 1].id)) {
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (sel.has(next[i].id) && !sel.has(next[i - 1].id)) {
        [next[i], next[i - 1]] = [next[i - 1], next[i]];
      }
    }
  }
  return next;
}

// Order actions target the whole selection when the clicked node is part
// of a multi-selection; otherwise just that node.
function orderTargets(s: { nodes: AppNode[] }, id: string): string[] {
  const selected = s.nodes.filter((n) => n.selected).map((n) => n.id);
  return selected.length > 1 && selected.includes(id) ? selected : [id];
}

function reorderNodesInArray(
  nodes: AppNode[],
  ids: string[],
  mode: OrderMode
): AppNode[] {
  const sel = new Set(ids);
  if (sel.size === 0) return nodes;
  // Reorder each affected group's siblings independently, in place.
  const groups = new Set<string | null>();
  nodes.forEach((n) => {
    if (sel.has(n.id)) groups.add(n.data.groupId ?? null);
  });
  let next = nodes;
  for (const gid of groups) {
    const slots: number[] = [];
    const sibs: AppNode[] = [];
    next.forEach((n, i) => {
      if ((n.data.groupId ?? null) === gid) {
        slots.push(i);
        sibs.push(n);
      }
    });
    const reordered = reorderSiblings(sibs, sel, mode);
    const copy = [...next];
    slots.forEach((slotIdx, k) => {
      copy[slotIdx] = reordered[k];
    });
    next = copy;
  }
  return next;
}

export function descendantGroupIds(groups: Group[], rootId: string): Set<string> {
  const result = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of groups) {
      if (g.parentGroupId && result.has(g.parentGroupId) && !result.has(g.id)) {
        result.add(g.id);
        changed = true;
      }
    }
  }
  return result;
}

// Persisting on every set() would JSON.stringify the whole workspace
// (all pages, base64 images) 60×/s during drags. Debounce writes and only
// serialize when the timer fires.
type PersistedFlowState = Record<string, unknown>;
const PERSIST_DEBOUNCE_MS = 400;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWrite: {
  name: string;
  value: StorageValue<PersistedFlowState>;
} | null = null;

function flushPersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const w = pendingWrite;
  pendingWrite = null;
  if (w) void idbSet(w.name, JSON.stringify(w.value));
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPersist);
}

const idbStorage: PersistStorage<PersistedFlowState> = {
  getItem: async (name) => {
    const raw = (await idbGet(name)) as string | undefined;
    return raw ? (JSON.parse(raw) as StorageValue<PersistedFlowState>) : null;
  },
  setItem: (name, value) => {
    pendingWrite = { name, value };
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flushPersist, PERSIST_DEBOUNCE_MS);
  },
  removeItem: async (name) => {
    // Cancel any pending write so it can't resurrect cleared data.
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    pendingWrite = null;
    await idbDel(name);
  },
};

export const useFlowStore = create<FlowState>()(
  persist(
    temporal(
    (set) => ({
  projectName: "Untitled",
  nodes: [],
  edges: [],
  customBlocks: [],
  groups: [],
  pages: [{ id: "page-1", name: "Page 1" }],
  activePageId: "page-1",
  pageContents: {},
  scenarioDocument: createEmptyScenarioDocument(),
  turbo: false,
  turboColors: DEFAULT_TURBO_COLORS,
  edgeCurveStyle: "stepped" as EdgeCurveStyle,
  edgeLineStyle: "solid" as EdgeLineStyle,
  edgeDashGap: 6,
  showControls: true,
  showSmartGuides: true,
  motionPreference: "system" as MotionPreference,
  videoTitle: "",
  videoStartDelayMs: 3_000,
  videoBetweenDelayMs: 400,
  videoEndDelayMs: 0,
  videoCameraFollowEnabled: true,
  workMode: "design" as WorkMode,
  canvasViewport: null,
  previewReturnMode: "design" as EditorMode,
  animationPathDraft: null,
  editingTextNodeId: null,

  onNodesChange: (changes) =>
    set((s) => {
      const removedNodeIds = changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id);
      if (removedNodeIds.length === 0) {
        return { nodes: syncBoundLines(applyNodeChanges(changes, s.nodes)) };
      }
      const retainedChanges = changes.filter(
        (change) => change.type !== "remove"
      );
      return deleteAuthoredElements(
        {
          ...s,
          nodes: syncBoundLines(applyNodeChanges(retainedChanges, s.nodes)),
        },
        { nodeIds: removedNodeIds }
      );
    }),

  onEdgesChange: (changes) =>
    set((s) => {
      const removedEdgeIds = changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id);
      if (removedEdgeIds.length === 0) {
        const edges = applyEdgeChanges(changes, s.edges);
        const selectedEdgeIds = changes.flatMap((change) =>
          change.type === "select" && change.selected ? [change.id] : []
        );
        return {
          edges,
          scenarioDocument: activateScenarioForEdges(
            s.scenarioDocument,
            selectedEdgeIds
          ),
        };
      }
      const retainedChanges = changes.filter(
        (change) => change.type !== "remove"
      );
      return deleteAuthoredElements(
        {
          ...s,
          edges: applyEdgeChanges(retainedChanges, s.edges),
        },
        { edgeIds: removedEdgeIds }
      );
    }),

  onConnect: (conn) =>
    set((s) => ({
      edges: addEdge(
        {
          ...conn,
          type: "labeled",
          data: {
            label: "",
            turbo: s.turbo,
            color: s.edgeColor,
            curveStyle: s.edgeCurveStyle,
            lineStyle: s.edgeLineStyle,
            dashGap: s.edgeDashGap,
          },
          animated: false,
          markerEnd: s.turbo ? undefined : edgeMarker(s.edgeColor),
        },
        s.edges
      ) as LabeledEdge[],
    })),

  addInfraNode: (block, position) => {
    const id = nextNodeId();
    set((s) => {
      const variant: InfraVariant = block.variant ?? "row";
      return {
        nodes: [
          ...s.nodes,
          {
            id,
            type: "infra",
            position,
            style: infraSize(variant),
            zIndex: 0,
            data: {
              blockId: block.id,
              label: block.label,
              subtitle: block.subtitle,
              variant,
              bgColor: block.bgColor,
              titleColor: block.titleColor,
              subtitleColor: block.subtitleColor,
              borderColor: block.borderColor,
              iconPosition: block.iconPosition,
              textAlign: block.textAlign,
              customIcon: block.customIcon,
            },
          },
        ],
      };
    });
    return id;
  },

  insertTemplate: (templateId, position) =>
    set((s) => {
      const template = findTemplate(templateId);
      if (!template) return s;
      const nodeIds = new Map<string, string>();
      const templateNodes = template.nodes.flatMap((item) => {
        const block = CORE_BLOCKS.find((candidate) => candidate.id === item.blockId);
        if (!block) return [];
        const id = nextNodeId();
        nodeIds.set(item.key, id);
        const variant: InfraVariant = block.variant ?? "row";
        return [
          {
            id,
            type: "infra" as const,
            position: {
              x: position.x + item.position.x,
              y: position.y + item.position.y,
            },
            style: infraSize(variant),
            zIndex: 0,
            data: {
              blockId: block.id,
              label: item.label ?? block.label,
              subtitle: item.subtitle ?? block.subtitle,
              variant,
              bgColor: block.bgColor,
              titleColor: block.titleColor,
              subtitleColor: block.subtitleColor,
              borderColor: block.borderColor,
              iconPosition: block.iconPosition,
              textAlign: block.textAlign,
              customIcon: block.customIcon,
            },
          } satisfies AppNode,
        ];
      });
      const edgeIds = new Map<string, string>();
      const templateEdges = template.edges.flatMap((item) => {
        const source = nodeIds.get(item.source);
        const target = nodeIds.get(item.target);
        if (!source || !target) return [];
        const id = nextEdgeId();
        edgeIds.set(item.key, id);
        return [
          {
            id,
            type: "labeled" as const,
            source,
            target,
            sourceHandle: item.sourceHandle,
            targetHandle: item.targetHandle,
            animated: false,
            markerEnd: s.turbo ? undefined : edgeMarker(s.edgeColor),
            data: {
              label: "",
              turbo: s.turbo,
              color: s.edgeColor,
              curveStyle: template.edgeCurveStyle ?? s.edgeCurveStyle,
              lineStyle: s.edgeLineStyle,
              dashGap: s.edgeDashGap,
            },
          } satisfies LabeledEdge,
        ];
      });
      const edgeByNodes = new Map(
        template.edges.map((item) => [
          `${item.source}:${item.target}`,
          edgeIds.get(item.key),
        ])
      );
      const scenarios = template.animations.flatMap((animation) => {
        const pathNodeIds = animation.nodeKeys.map((key) => nodeIds.get(key));
        if (pathNodeIds.some((id) => !id)) return [];
        const pathEdgeIds = animation.nodeKeys.slice(0, -1).map((key, index) =>
          edgeByNodes.get(`${key}:${animation.nodeKeys[index + 1]}`)
        );
        if (pathEdgeIds.some((id) => !id)) return [];
        const scenario = buildAnimationPathScenario({
          name: animation.name,
          nodeIds: pathNodeIds as string[],
          edgeIds: pathEdgeIds as string[],
          edges: templateEdges,
          appearance: {
            ...defaultAnimationPathAppearance(),
            colors: animation.colors,
            widthPx: 3,
            glowBlurPx: 4,
          },
        });
        return scenario ? [scenario] : [];
      });
      const previewScenario = template.previewName
        ? buildSequentialPreviewScenario(template.previewName, scenarios)
        : null;
      const templateScenarios = previewScenario
        ? [previewScenario, ...scenarios]
        : scenarios;
      return {
        nodes: [...s.nodes, ...templateNodes],
        edges: [...s.edges, ...templateEdges],
        scenarioDocument: {
          ...s.scenarioDocument,
          scenarios: [
            ...s.scenarioDocument.scenarios,
            ...templateScenarios,
          ],
          defaultScenarioId:
            previewScenario?.id ??
            scenarios[0]?.id ??
            s.scenarioDocument.defaultScenarioId,
        },
      };
    }),

  addShapeNode: (shape, position, size) => {
    const id = nextNodeId();
    set((s) => ({
      // Newest node on top (array-last), like Figma — reorder via the
      // Layers panel / Arrange buttons. Uniform zIndex keeps paint order
      // driven purely by the array.
      nodes: [
        ...s.nodes,
        {
          id,
          type: "shape",
          position,
          style:
            size ??
            (shape === "circle"
              ? { width: 220, height: 220 }
              : { width: 300, height: 200 }),
          zIndex: 0,
          data: { shape, accent: "slate" },
        },
      ],
    }));
    return id;
  },

  addTextNode: (position) => {
    const id = nextNodeId();
    set((s) => ({
      nodes: [
        ...s.nodes,
        {
          id,
          type: "text",
          position,
          zIndex: 0,
          data: { text: "Text", accent: "amber", bgColor: "transparent" },
        },
      ],
      editingTextNodeId: id,
    }));
    return id;
  },

  setEditingTextNode: (editingTextNodeId) => set({ editingTextNodeId }),

  addCodeNode: (position) =>
    set((s) => ({
      nodes: [
        ...s.nodes,
        {
          id: nextNodeId(),
          type: "code",
          position,
          zIndex: 0,
          data: {
            code: "// your code here\nconst answer = 42;",
            language: "typescript",
          },
        },
      ],
    })),

  addStepNode: (position) =>
    set((s) => {
      const nextIndex =
        s.nodes.filter((n) => n.type === "step").length + 1;
      return {
        nodes: [
          ...s.nodes,
          {
            id: nextNodeId(),
            type: "step",
            position,
            style: { width: 56, height: 56 },
            zIndex: 0,
            data: { step: nextIndex, accent: "indigo" },
          },
        ],
      };
    }),

  addLineNode: (start, end = { x: start.x + 176, y: start.y }) => {
    const id = nextNodeId();
    const geometry = lineGeometryFromPoints(start, end);
    set((s) => ({
      nodes: [
        ...s.nodes,
        {
          id,
          type: "line",
          position: geometry.position,
          style: { width: geometry.width, height: geometry.height },
          zIndex: 0,
          data: {
            curvature: 0,
            start: geometry.start,
            end: geometry.end,
            arrowStart: false,
            arrowEnd: true,
            arrowStartShape: "triangle",
            arrowEndShape: "triangle",
            strokeColor: "#94a3b8",
            strokeWidth: 2,
            dashed: false,
          },
        },
      ],
    }));
    return id;
  },

  updateLineGeometry: (id, geometry) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id && n.type === "line"
          ? {
              ...n,
              position: geometry.position,
              style: {
                ...(n.style ?? {}),
                width: geometry.width,
                height: geometry.height,
              },
              data: {
                ...n.data,
                start: geometry.start,
                end: geometry.end,
                direction: undefined,
                rotation: undefined,
              },
            }
          : n
      ),
    })),

  setLineEndpointBinding: (id, endpoint, binding) =>
    set((s) => ({
      nodes: syncBoundLines(
        s.nodes.map((node) =>
          node.id === id && node.type === "line"
            ? {
                ...node,
                data: {
                  ...node.data,
                  [endpoint === "start" ? "startBinding" : "endBinding"]:
                    binding ?? undefined,
                },
              }
            : node
        )
      ),
    })),

  addImageNode: (src, position, size) => {
    const id = nextNodeId();
    set((s) => ({
      nodes: [
        ...s.nodes,
        {
          id,
          type: "image",
          position,
          style: size,
          zIndex: 0,
          data: {
            src,
            fit: "contain",
            scale: 100,
            opacity: 100,
            borderWidth: 1,
            borderRadius: 8,
            borderStyle: "solid",
          },
        },
      ],
    }));
    return id;
  },

  duplicateNodes: (ids, offset = { x: 24, y: 24 }) =>
    set((s) => {
      const idSet = new Set(ids);
      const toClone = s.nodes.filter((n) => idSet.has(n.id));
      if (toClone.length === 0) return s;
      const idMap = new Map<string, string>();
      const clones = toClone.map((n) => {
        const newId = nextNodeId();
        idMap.set(n.id, newId);
        return {
          ...n,
          id: newId,
          position: {
            x: n.position.x + offset.x,
            y: n.position.y + offset.y,
          },
          selected: true,
          data: { ...n.data },
        } as AppNode;
      });
      const edgeClones = s.edges
        .filter((e) => idSet.has(e.source) && idSet.has(e.target))
        .map((e) => {
          const id = nextEdgeId();
          return {
            ...e,
            id,
            source: idMap.get(e.source)!,
            target: idMap.get(e.target)!,
            selected: false,
            data: e.data ? { ...e.data } : undefined,
          };
        });
      const sourceEdges = s.edges.filter(
        (e) => idSet.has(e.source) && idSet.has(e.target)
      );
      const deselected = s.nodes.map((n) =>
        n.selected ? { ...n, selected: false } : n
      );
      return {
        nodes: [...deselected, ...clones],
        edges: [...s.edges, ...edgeClones],
        scenarioDocument: cloneScenarioTargets(
          s.scenarioDocument,
          [
            ...[...idMap.entries()].map(([sourceId, targetId]) => ({
              source: { type: "node", id: sourceId },
              target: { type: "node", id: targetId },
            })),
            ...sourceEdges.map((sourceEdge, index) => ({
              source: { type: "edge", id: sourceEdge.id },
              target: { type: "edge", id: edgeClones[index].id },
            })),
          ]
        ),
      };
    }),

  updateNodeData: (id, patch) =>
    set((s) => {
      const editing = s.nodes.find((n) => n.id === id);
      const selectedCount = s.nodes.reduce(
        (acc, n) => acc + (n.selected ? 1 : 0),
        0
      );
      // With a multi-selection, propagate shared style props to every
      // selected node (Figma-style); identity fields stay on the edited one.
      if (editing?.selected && selectedCount > 1) {
        const shared: NodeDataPatch = {};
        for (const [k, v] of Object.entries(patch)) {
          if (!IDENTITY_KEYS.has(k)) (shared as Record<string, unknown>)[k] = v;
        }
        return {
          nodes: syncBoundLines(
            s.nodes.map((n) => {
              if (n.id === id)
                return { ...n, data: { ...n.data, ...patch } } as AppNode;
              if (n.selected)
                return { ...n, data: { ...n.data, ...shared } } as AppNode;
              return n;
            })
          ),
        };
      }
      return {
        nodes: syncBoundLines(
          s.nodes.map((n) =>
            n.id === id
              ? ({ ...n, data: { ...n.data, ...patch } } as AppNode)
              : n
          )
        ),
      };
    }),

  updateEdgeLabel: (id, label) =>
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, label } } : e
      ),
    })),

  setEdgeLabel: (label) =>
    set((s) => {
      if (!s.edges.some((edge) => edge.selected)) return s;
      return {
        edges: s.edges.map((edge) =>
          edge.selected
            ? { ...edge, data: { ...(edge.data ?? {}), label } }
            : edge
        ),
      };
    }),

  renameNode: (id, name) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? ({ ...n, data: renamedData(n, name) } as AppNode) : n
      ),
    })),

  deleteNode: (id) =>
    set((s) => deleteAuthoredElements(s, { nodeIds: [id] })),

  selectNodes: (ids) =>
    set((s) => {
      const set_ = new Set(ids);
      return {
        nodes: s.nodes.map((n) => ({ ...n, selected: set_.has(n.id) })),
      };
    }),

  toggleNodeSelection: (id) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, selected: !n.selected } : n
      ),
    })),

  toggleNodeHidden: (id) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, hidden: !n.hidden } : n
      ),
    })),

  toggleNodeLocked: (id) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n;
        const locked = !(n.draggable === false && n.selectable === false);
        return locked
          ? { ...n, draggable: false, selectable: false, selected: false }
          : { ...n, draggable: undefined, selectable: undefined };
      }),
    })),

  toggleGroupHidden: (id) =>
    set((s) => {
      const targets = descendantGroupIds(s.groups, id);
      const affected = s.nodes.filter((n) => {
        const gid = n.data.groupId ?? null;
        return gid !== null && targets.has(gid);
      });
      if (affected.length === 0) return s;
      const anyVisible = affected.some((n) => !n.hidden);
      return {
        nodes: s.nodes.map((n) => {
          const gid = n.data.groupId ?? null;
          if (gid === null || !targets.has(gid)) return n;
          return { ...n, hidden: anyVisible };
        }),
      };
    }),

  toggleGroupLocked: (id) =>
    set((s) => {
      const targets = descendantGroupIds(s.groups, id);
      const affected = s.nodes.filter((n) => {
        const gid = n.data.groupId ?? null;
        return gid !== null && targets.has(gid);
      });
      if (affected.length === 0) return s;
      const anyUnlocked = affected.some(
        (n) => !(n.draggable === false && n.selectable === false)
      );
      return {
        nodes: s.nodes.map((n) => {
          const gid = n.data.groupId ?? null;
          if (gid === null || !targets.has(gid)) return n;
          return anyUnlocked
            ? { ...n, draggable: false, selectable: false, selected: false }
            : { ...n, draggable: undefined, selectable: undefined };
        }),
      };
    }),

  addCustomBlock: (block) => {
    const def: BlockDef = { ...block, id: nextBlockId(), builtin: false };
    set((s) => ({ customBlocks: [...s.customBlocks, def] }));
    return def;
  },

  deleteCustomBlock: (id) =>
    set((s) => ({ customBlocks: s.customBlocks.filter((b) => b.id !== id) })),

  toggleTurbo: () =>
    set((s) => {
      const selectedEdges = s.edges.filter((e) => e.selected);
      const selectedNodes = s.nodes.filter((n) => n.selected);
      if (selectedEdges.length + selectedNodes.length > 0) {
        const allOn =
          selectedEdges.every((e) => e.data?.turbo) &&
          selectedNodes.every((n) => (n.data as WithColors).turbo);
        const nextFlag = !allOn;
        return {
          edges: s.edges.map((e) =>
            e.selected
              ? {
                  ...e,
                  data: { ...(e.data ?? {}), turbo: nextFlag },
                  markerEnd: nextFlag
                    ? undefined
                    : edgeMarker(e.data?.color),
                }
              : e
          ),
          nodes: s.nodes.map((n) =>
            n.selected
              ? ({
                  ...n,
                  data: { ...n.data, turbo: nextFlag },
                } as AppNode)
              : n
          ),
        };
      }
      const next = !s.turbo;
      return {
        turbo: next,
        edges: s.edges.map((e) => ({
          ...e,
          data: { ...(e.data ?? {}), turbo: next },
          markerEnd: next ? undefined : edgeMarker(e.data?.color),
        })),
        nodes: s.nodes.map((n) =>
          ({ ...n, data: { ...n.data, turbo: next } } as AppNode)
        ),
      };
    }),

  applySelectedEdgeEffect: (effect, clip) =>
    set((s) => {
      const edgeIds = s.edges
        .filter((edge) => edge.selected)
        .map((edge) => edge.id);
      const scenarioDocument = applyEdgeEffect(s.scenarioDocument, {
        edgeIds,
        effect,
        clip,
      });
      return scenarioDocument === s.scenarioDocument
        ? s
        : { scenarioDocument };
    }),

  patchSelectedEdgeEffects: (patch) =>
    set((s) => {
      const edgeIds = s.edges
        .filter((edge) => edge.selected)
        .map((edge) => edge.id);
      const scenarioDocument = patchEdgeEffects(s.scenarioDocument, {
        edgeIds,
        patch,
      });
      return scenarioDocument === s.scenarioDocument
        ? s
        : { scenarioDocument };
    }),

  removeSelectedEdgeEffects: () =>
    set((s) => {
      const edgeIds = s.edges
        .filter((edge) => edge.selected)
        .map((edge) => edge.id);
      const scenarioDocument = removeEdgeEffects(s.scenarioDocument, {
        edgeIds,
      });
      return scenarioDocument === s.scenarioDocument
        ? s
        : { scenarioDocument };
    }),

  animateAllEdges: () =>
    set((s) => {
      const edgeIds = s.edges.map((edge) => edge.id);
      if (edgeIds.length === 0) return s;
      const cleared = removeEdgeEffects(s.scenarioDocument, { edgeIds });
      return {
        scenarioDocument: applyEdgeEffect(cleared, {
          edgeIds,
          effect: createGradientBeamEffect(),
          clip: createGradientBeamClip(),
        }),
      };
    }),

  animateRequestFlow: (startNodeId) =>
    set((s) => {
      const steps = buildRequestFlow(s.edges, startNodeId);
      if (steps.length === 0) return s;
      const allEdgeIds = s.edges.map((edge) => edge.id);
      let scenarioDocument = removeEdgeEffects(s.scenarioDocument, {
        edgeIds: allEdgeIds,
      });
      for (const step of steps) {
        scenarioDocument = applyEdgeEffect(scenarioDocument, {
          edgeIds: [step.edgeId],
          effect: createGradientBeamEffect(),
          clip: createGradientBeamClip(
            REQUEST_FLOW_EDGE_DELAY_MS +
              step.hop * REQUEST_FLOW_HOP_DELAY_MS
          ),
        });
      }
      const nodeHops = new Map<
        string,
        { hop: number; entrySide: NodeBorderEntrySide }
      >([[startNodeId, { hop: 0, entrySide: "left" }]]);
      for (const step of steps) {
        const edge = s.edges.find((candidate) => candidate.id === step.edgeId);
        if (!edge) continue;
        const hop = step.hop + 1;
        const previous = nodeHops.get(edge.target);
        if (previous === undefined || hop < previous.hop) {
          nodeHops.set(edge.target, {
            hop,
            entrySide: nodeEntrySide(edge),
          });
        }
      }
      scenarioDocument = removeNodeEffects(scenarioDocument, {
        nodeIds: s.nodes.map((node) => node.id),
      });
      for (const [nodeId, nodeHop] of nodeHops) {
        scenarioDocument = applyNodeEffect(scenarioDocument, {
          nodeIds: [nodeId],
          effect: createNodeBorderEffect(nodeHop.entrySide),
          clip: createNodeBorderClip(
            nodeHop.hop * REQUEST_FLOW_HOP_DELAY_MS
          ),
        });
      }
      return { scenarioDocument };
    }),

  animateSelectedPath: () =>
    set((s) => {
      const selectedEdges = s.edges.filter((edge) => edge.selected);
      const selectedNodeIds = new Set(
        s.nodes.filter((node) => node.selected).map((node) => node.id)
      );
      const pathEdges =
        selectedEdges.length > 0
          ? selectedEdges
          : s.edges.filter(
              (edge) =>
                selectedNodeIds.has(edge.source) &&
                selectedNodeIds.has(edge.target)
            );
      const steps = buildSelectedRequestFlow(pathEdges);
      if (steps.length === 0) return s;

      const allEdgeIds = s.edges.map((edge) => edge.id);
      let scenarioDocument = removeEdgeEffects(s.scenarioDocument, {
        edgeIds: allEdgeIds,
      });
      for (const step of steps) {
        scenarioDocument = applyEdgeEffect(scenarioDocument, {
          edgeIds: [step.edgeId],
          effect: createGradientBeamEffect(),
          clip: createGradientBeamClip(
            step.hop * GRADIENT_BEAM_DURATION_MS
          ),
        });
      }
      return { scenarioDocument };
    }),

  beginAnimationPath: (startNodeId) => {
    scenarioRuntime.pause();
    set((s) => {
      const hasStart =
        !!startNodeId && s.nodes.some((node) => node.id === startNodeId);
      const existingDraft = s.animationPathDraft;
      const pathNumber = findAuthoredCustomPaths(
        s.scenarioDocument,
        s.edges
      ).length + 1;
      return {
        animationPathDraft: {
          scenarioId: existingDraft?.scenarioId ?? null,
          name: existingDraft?.name ?? `Custom path ${pathNumber}`,
          preset: existingDraft?.preset ?? "single-line",
          staggerMs: existingDraft?.staggerMs ?? 0,
          appearance:
            existingDraft?.appearance ?? defaultAnimationPathAppearance(),
          nodeIds: hasStart ? [startNodeId] : [],
          edgeIds: [],
          error: null,
        },
        nodes: s.nodes.map((node) =>
          node.selected ? { ...node, selected: false } : node
        ),
        edges: s.edges.map((edge) =>
          edge.selected ? { ...edge, selected: false } : edge
        ),
      };
    });
  },

  setAnimationPathName: (name) =>
    set((s) =>
      s.animationPathDraft
        ? { animationPathDraft: { ...s.animationPathDraft, name } }
        : s
    ),

  setAnimationPathPreset: (preset) =>
    set((s) =>
      s.animationPathDraft
        ? {
            animationPathDraft: {
              ...s.animationPathDraft,
              preset,
              nodeIds: s.animationPathDraft.nodeIds.slice(0, 1),
              edgeIds: [],
              error: null,
            },
          }
        : s
    ),

  setAnimationPathStaggerMs: (staggerMs) =>
    set((s) =>
      s.animationPathDraft
        ? {
            animationPathDraft: {
              ...s.animationPathDraft,
              staggerMs:
                staggerMs === 0
                  ? 0
                  : Math.min(2_000, Math.max(100, staggerMs)),
            },
          }
        : s
    ),

  setAnimationPathAppearance: (patch) =>
    set((s) => {
      const draft = s.animationPathDraft;
      if (!draft) return s;
      const appearance = {
        ...draft.appearance,
        ...patch,
        colors: patch.colors
          ? ([...patch.colors] as [string, string])
          : draft.appearance.colors,
        responseColors: patch.responseColors
          ? ([...patch.responseColors] as [string, string])
          : draft.appearance.responseColors,
      };
      return {
        animationPathDraft: {
          ...draft,
          appearance: {
            ...appearance,
            widthPx: Math.min(24, Math.max(0.5, appearance.widthPx)),
            beamLengthPx: Math.min(
              240,
              Math.max(8, appearance.beamLengthPx)
            ),
            opacity: Math.min(1, Math.max(0, appearance.opacity)),
            glowBlurPx: Math.min(32, Math.max(0, appearance.glowBlurPx)),
          },
        },
      };
    }),

  appendAnimationPathNode: (nodeId) =>
    set((s) => {
      const draft = s.animationPathDraft;
      if (!draft || !s.nodes.some((node) => node.id === nodeId)) return s;
      if (draft.nodeIds.length === 0) {
        return {
          animationPathDraft: {
            ...draft,
            nodeIds: [nodeId],
            edgeIds: [],
            error: null,
          },
        };
      }

      const lastNodeId = draft.nodeIds[draft.nodeIds.length - 1];
      const hubId = draft.nodeIds[0];
      const fail = (error: string) => ({
        animationPathDraft: { ...draft, error },
      });
      if (draft.preset === "bidirectional" && draft.edgeIds.length > 0) {
        return fail("Bi-directional paths use two connected blocks.");
      }
      if (draft.preset === "failover" && draft.edgeIds.length >= 2) {
        return fail("Failover paths use a primary and one fallback block.");
      }
      if (
        draft.preset === "loop" &&
        draft.edgeIds.length > 0 &&
        lastNodeId === hubId
      ) {
        return fail("This loop is already closed.");
      }

      if (draft.preset === "scatter-gather") {
        const finalizedWorkerCount = draft.nodeIds.length - 2;
        const finalized =
          finalizedWorkerCount >= 2 &&
          draft.edgeIds.length === finalizedWorkerCount * 2;
        if (finalized) return fail("This scatter and gather path is complete.");

        const workerIds = draft.nodeIds.slice(1);
        const gatherEdges = workerIds.map((workerId) =>
          s.edges.find(
            (edge) => edge.source === workerId && edge.target === nodeId
          )
        );
        if (
          workerIds.length >= 2 &&
          gatherEdges.every(
            (edge) => edge && !draft.edgeIds.includes(edge.id)
          )
        ) {
          return {
            animationPathDraft: {
              ...draft,
              nodeIds: [...draft.nodeIds, nodeId],
              edgeIds: [
                ...draft.edgeIds,
                ...gatherEdges.map((edge) => edge!.id),
              ],
              error: null,
            },
          };
        }

        const scatterEdge = s.edges.find(
          (edge) => edge.source === hubId && edge.target === nodeId
        );
        if (!scatterEdge) {
          return fail(
            workerIds.length < 2
              ? "Choose at least two workers connected from the source block."
              : "Choose another worker, or a result block connected from every worker."
          );
        }
        if (draft.edgeIds.includes(scatterEdge.id)) {
          return fail("That connection is already in this path.");
        }
        return {
          animationPathDraft: {
            ...draft,
            nodeIds: [...draft.nodeIds, nodeId],
            edgeIds: [...draft.edgeIds, scatterEdge.id],
            error: null,
          },
        };
      }

      if (
        draft.preset === "cascade" &&
        draft.nodeIds.includes(nodeId)
      ) {
        return fail("That block is already in this cascade.");
      }
      if (
        draft.preset === "loop" &&
        draft.nodeIds.includes(nodeId) &&
        nodeId !== hubId
      ) {
        return fail("Close the loop by clicking its first block.");
      }

      const outputPreset =
        draft.preset === "multiple-outputs" ||
        draft.preset === "round-robin" ||
        draft.preset === "staggered-outputs" ||
        draft.preset === "failover";
      const edge = s.edges.find((candidate) => {
        if (draft.preset === "multiple-inputs") {
          return candidate.source === nodeId && candidate.target === hubId;
        }
        if (outputPreset) {
          return candidate.source === hubId && candidate.target === nodeId;
        }
        if (draft.preset === "cascade") {
          return (
            draft.nodeIds.includes(candidate.source) &&
            candidate.target === nodeId &&
            !draft.edgeIds.includes(candidate.id)
          );
        }
        if (draft.preset === "bidirectional") {
          return (
            (candidate.source === lastNodeId && candidate.target === nodeId) ||
            (candidate.source === nodeId && candidate.target === lastNodeId)
          );
        }
        return candidate.source === lastNodeId && candidate.target === nodeId;
      });
      if (!edge) {
        const error =
          draft.preset === "multiple-inputs"
            ? "Choose a block with a connection into the receiving block."
            : outputPreset
              ? "Choose a block connected from the source block."
              : draft.preset === "cascade"
                ? "Choose a new block connected from the current cascade."
              : draft.preset === "bidirectional"
                ? "Choose a directly connected block."
                : "Choose a directly connected outgoing block.";
        return fail(error);
      }
      if (draft.edgeIds.includes(edge.id)) {
        return fail("That connection is already in this path.");
      }

      return {
        animationPathDraft: {
          ...draft,
          nodeIds: [...draft.nodeIds, nodeId],
          edgeIds: [...draft.edgeIds, edge.id],
          error: null,
        },
      };
    }),

  undoAnimationPathNode: () =>
    set((s) => {
      const draft = s.animationPathDraft;
      if (!draft || draft.nodeIds.length === 0) return s;
      const scatterWorkerCount = draft.nodeIds.length - 2;
      const undoGather =
        draft.preset === "scatter-gather" &&
        scatterWorkerCount >= 2 &&
        draft.edgeIds.length === scatterWorkerCount * 2;
      return {
        animationPathDraft: {
          ...draft,
          nodeIds: draft.nodeIds.slice(0, -1),
          edgeIds: undoGather
            ? draft.edgeIds.slice(0, scatterWorkerCount)
            : draft.edgeIds.slice(0, -1),
          error: null,
        },
      };
    }),

  cancelAnimationPath: () => set({ animationPathDraft: null }),

  editAnimationPath: (scenarioId) => {
    scenarioRuntime.pause();
    set((s) => {
      const paths = findAuthoredCustomPaths(s.scenarioDocument, s.edges);
      const path = scenarioId
        ? paths.find((candidate) => candidate.scenarioId === scenarioId)
        : paths.find(
            (candidate) =>
              candidate.scenarioId === s.scenarioDocument.defaultScenarioId
          ) ?? paths[0];
      if (!path) return s;
      return {
        animationPathDraft: {
          ...path,
          staggerMs: path.staggerMs ?? 0,
          name:
            path.name === "Default scenario" ? "Custom path" : path.name,
          appearance: animationPathAppearance(
            s.scenarioDocument,
            path.scenarioId
          ),
          error: null,
        },
        nodes: s.nodes.map((node) =>
          node.selected ? { ...node, selected: false } : node
        ),
        edges: s.edges.map((edge) =>
          edge.selected ? { ...edge, selected: false } : edge
        ),
      };
    });
  },

  activateAnimationPath: (scenarioId) =>
    set((s) =>
      s.scenarioDocument.scenarios.some(
        (scenario) => scenario.id === scenarioId
      )
        ? {
            scenarioDocument: {
              ...s.scenarioDocument,
              defaultScenarioId: scenarioId,
            },
          }
        : s
    ),

  reorderAnimationPath: (scenarioId, beforeScenarioId) =>
    set((s) => {
      const pathIds = findAuthoredCustomPaths(
        s.scenarioDocument,
        s.edges
      ).map((path) => path.scenarioId);
      if (
        !pathIds.includes(scenarioId) ||
        scenarioId === beforeScenarioId
      ) {
        return s;
      }
      const reordered = pathIds.filter((id) => id !== scenarioId);
      const beforeIndex = beforeScenarioId
        ? reordered.indexOf(beforeScenarioId)
        : reordered.length;
      reordered.splice(
        beforeIndex < 0 ? reordered.length : beforeIndex,
        0,
        scenarioId
      );
      if (reordered.every((id, index) => id === pathIds[index])) return s;

      const scenariosById = new Map(
        s.scenarioDocument.scenarios.map((scenario) => [scenario.id, scenario])
      );
      const pathIdSet = new Set(pathIds);
      let pathIndex = 0;
      return {
        scenarioDocument: {
          ...s.scenarioDocument,
          scenarios: s.scenarioDocument.scenarios.map((scenario) =>
            pathIdSet.has(scenario.id)
              ? scenariosById.get(reordered[pathIndex++]) ?? scenario
              : scenario
          ),
        },
      };
    }),

  deleteAnimationPath: (scenarioId) =>
    set((s) => {
      const customPaths = findAuthoredCustomPaths(
        s.scenarioDocument,
        s.edges
      );
      if (!customPaths.some((path) => path.scenarioId === scenarioId)) return s;

      const scenarios = s.scenarioDocument.scenarios.filter(
        (scenario) => scenario.id !== scenarioId
      );
      const nextPathId = customPaths.find(
        (path) => path.scenarioId !== scenarioId
      )?.scenarioId;
      return {
        scenarioDocument: {
          ...s.scenarioDocument,
          scenarios,
          defaultScenarioId:
            s.scenarioDocument.defaultScenarioId === scenarioId
              ? nextPathId ?? scenarios[0]?.id ?? null
              : s.scenarioDocument.defaultScenarioId,
        },
        animationPathDraft:
          s.animationPathDraft?.scenarioId === scenarioId
            ? null
            : s.animationPathDraft,
      };
    }),

  animateDraftPath: () =>
    set((s) => {
      const draft = s.animationPathDraft;
      const edgeIds = draft?.edgeIds ?? [];
      const nodeIds = draft?.nodeIds ?? [];
      if (edgeIds.length === 0) return s;
      const name =
        draft?.name.trim() ||
        `Custom path ${findAuthoredCustomPaths(s.scenarioDocument, s.edges).length + 1}`;
      const appearance = draft?.appearance ?? defaultAnimationPathAppearance();
      const savedScenario = buildAnimationPathScenario({
        id: draft?.scenarioId ?? undefined,
        name,
        nodeIds,
        edgeIds,
        edges: s.edges,
        appearance,
        preset: draft?.preset ?? "single-line",
        staggerMs: draft?.staggerMs ?? 0,
      });
      if (!savedScenario) return s;
      const existingIndex = s.scenarioDocument.scenarios.findIndex(
        (scenario) => scenario.id === savedScenario.id
      );
      const scenarios =
        existingIndex === -1
          ? [...s.scenarioDocument.scenarios, savedScenario]
          : s.scenarioDocument.scenarios.map((scenario, index) =>
              index === existingIndex ? savedScenario : scenario
            );
      return {
        scenarioDocument: {
          ...s.scenarioDocument,
          scenarios,
          defaultScenarioId: savedScenario.id,
        },
        animationPathDraft: null,
      };
    }),

  setEdgeColor: (color) =>
    set((s) => {
      const selected = s.edges.filter((e) => e.selected);
      if (selected.length > 0) {
        return {
          edges: s.edges.map((e) =>
            e.selected
              ? {
                  ...e,
                  data: { ...(e.data ?? {}), color },
                  markerEnd: e.data?.turbo ? undefined : edgeMarker(color),
                }
              : e
          ),
        };
      }
      return {
        edgeColor: color,
        edges: s.edges.map((e) => ({
          ...e,
          data: { ...(e.data ?? {}), color },
          markerEnd: e.data?.turbo ? undefined : edgeMarker(color),
        })),
      };
    }),

  setEdgeCurveStyle: (style) =>
    set((s) => {
      const selected = s.edges.filter((edge) => edge.selected);
      if (selected.length > 0) {
        return {
          edges: s.edges.map((edge) =>
            edge.selected
              ? {
                  ...edge,
                  data: { ...(edge.data ?? {}), curveStyle: style },
                }
              : edge
          ),
        };
      }
      return {
        edgeCurveStyle: style,
        edges: s.edges.map((edge) => ({
          ...edge,
          data: { ...(edge.data ?? {}), curveStyle: style },
        })),
      };
    }),

  setEdgeLabelColor: (key, color) =>
    set((s) => {
      const field =
        key === "text"
          ? "labelTextColor"
          : key === "bg"
          ? "labelBgColor"
          : "labelBorderColor";
      const selected = s.edges.filter((e) => e.selected);
      const targets = selected.length > 0 ? selected : s.edges;
      const targetIds = new Set(targets.map((e) => e.id));
      return {
        edges: s.edges.map((e) =>
          targetIds.has(e.id)
            ? { ...e, data: { ...(e.data ?? {}), [field]: color } }
            : e
        ),
      };
    }),

  setEdgeLineStyle: (style) =>
    set((s) => {
      const selected = s.edges.filter((e) => e.selected);
      if (selected.length > 0) {
        return {
          edges: s.edges.map((e) =>
            e.selected
              ? { ...e, data: { ...(e.data ?? {}), lineStyle: style } }
              : e
          ),
        };
      }
      return {
        edgeLineStyle: style,
        edges: s.edges.map((e) => ({
          ...e,
          data: { ...(e.data ?? {}), lineStyle: style },
        })),
      };
    }),

  setEdgeDashGap: (gap) =>
    set((s) => {
      const selected = s.edges.filter((e) => e.selected);
      if (selected.length > 0) {
        return {
          edges: s.edges.map((e) =>
            e.selected
              ? { ...e, data: { ...(e.data ?? {}), dashGap: gap } }
              : e
          ),
        };
      }
      return {
        edgeDashGap: gap,
        edges: s.edges.map((e) => ({
          ...e,
          data: { ...(e.data ?? {}), dashGap: gap },
        })),
      };
    }),

  setTurboColor: (index, color) =>
    set((s) => {
      const next = [...s.turboColors] as [string, string];
      next[index] = color;
      return { turboColors: next };
    }),

  bringToFront: (id) =>
    set((s) => ({ nodes: reorderNodesInArray(s.nodes, orderTargets(s, id), "front") })),

  sendToBack: (id) =>
    set((s) => ({ nodes: reorderNodesInArray(s.nodes, orderTargets(s, id), "back") })),

  bringForward: (id) =>
    set((s) => ({ nodes: reorderNodesInArray(s.nodes, orderTargets(s, id), "forward") })),

  sendBackward: (id) =>
    set((s) => ({ nodes: reorderNodesInArray(s.nodes, orderTargets(s, id), "backward") })),

  groupSelected: () =>
    set((s) => {
      const selected = s.nodes.filter((n) => n.selected);
      if (selected.length < 1) return s;
      const groupId = nextGroupId();
      const group: Group = {
        id: groupId,
        name: "Group",
        parentGroupId: null,
      };
      const selectedIds = new Set(selected.map((n) => n.id));
      return {
        groups: [...s.groups, group],
        nodes: s.nodes.map((n) =>
          selectedIds.has(n.id)
            ? ({ ...n, data: { ...n.data, groupId } } as AppNode)
            : n
        ),
      };
    }),

  createGroup: (parentGroupId = null) => {
    const id = nextGroupId();
    const g: Group = { id, name: "Group", parentGroupId: parentGroupId ?? null };
    set((s) => ({ groups: [...s.groups, g] }));
    return id;
  },

  renameGroup: (id, name) =>
    set((s) => ({
      groups: s.groups.map((g) => (g.id === id ? { ...g, name } : g)),
    })),

  deleteGroup: (id) =>
    set((s) => {
      const toRemove = descendantGroupIds(s.groups, id);
      const parent = s.groups.find((g) => g.id === id)?.parentGroupId ?? null;
      return {
        groups: s.groups
          .filter((g) => !toRemove.has(g.id))
          .map((g) =>
            toRemove.has(g.parentGroupId ?? "")
              ? { ...g, parentGroupId: parent }
              : g
          ),
        nodes: s.nodes.map((n) => {
          const gid = n.data.groupId ?? null;
          if (gid && toRemove.has(gid)) {
            return {
              ...n,
              data: { ...n.data, groupId: parent },
            } as AppNode;
          }
          return n;
        }),
        scenarioDocument: pruneScenarioTargets(
          s.scenarioDocument,
          [...toRemove].map((groupId) => ({ type: "group", id: groupId }))
        ),
      };
    }),

  toggleGroupCollapsed: (id) =>
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === id ? { ...g, collapsed: !g.collapsed } : g
      ),
    })),

  moveNodeToGroup: (nodeId, groupId) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? ({ ...n, data: { ...n.data, groupId } } as AppNode)
          : n
      ),
    })),

  moveGroupToGroup: (id, parentGroupId) =>
    set((s) => {
      if (id === parentGroupId) return s;
      if (parentGroupId && descendantGroupIds(s.groups, id).has(parentGroupId)) {
        return s;
      }
      return {
        groups: s.groups.map((g) =>
          g.id === id ? { ...g, parentGroupId: parentGroupId ?? null } : g
        ),
      };
    }),

  moveNodeBefore: (nodeId, beforeNodeId, groupId) =>
    set((s) => {
      if (nodeId === beforeNodeId) return s;
      const idx = s.nodes.findIndex((n) => n.id === nodeId);
      if (idx === -1) return s;
      const updated: AppNode = {
        ...s.nodes[idx],
        data: { ...s.nodes[idx].data, groupId: groupId ?? null },
      } as AppNode;
      const without = s.nodes.filter((_, i) => i !== idx);
      if (!beforeNodeId) {
        return { nodes: [...without, updated] };
      }
      const beforeIdx = without.findIndex((n) => n.id === beforeNodeId);
      if (beforeIdx === -1) return { nodes: [...without, updated] };
      const next = [...without];
      next.splice(beforeIdx, 0, updated);
      return { nodes: next };
    }),

  moveGroupBefore: (groupId, beforeGroupId, parentGroupId) =>
    set((s) => {
      if (groupId === beforeGroupId) return s;
      if (groupId === parentGroupId) return s;
      if (parentGroupId && descendantGroupIds(s.groups, groupId).has(parentGroupId)) {
        return s;
      }
      const idx = s.groups.findIndex((g) => g.id === groupId);
      if (idx === -1) return s;
      const updated: Group = {
        ...s.groups[idx],
        parentGroupId: parentGroupId ?? null,
      };
      const without = s.groups.filter((_, i) => i !== idx);
      if (!beforeGroupId) {
        return { groups: [...without, updated] };
      }
      const beforeIdx = without.findIndex((g) => g.id === beforeGroupId);
      if (beforeIdx === -1) return { groups: [...without, updated] };
      const next = [...without];
      next.splice(beforeIdx, 0, updated);
      return { groups: next };
    }),

  setProjectName: (name) =>
    set({ projectName: name.trim() || "Untitled" }),

  setPageBackground: (color) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === s.activePageId ? { ...p, bgColor: color } : p
      ),
    })),

  addPage: () => {
    const id = nextPageId();
    withHistoryReset(() =>
      set((s) => ({
        pages: [...s.pages, { id, name: `Page ${s.pages.length + 1}` }],
        activePageId: id,
        pageContents: {
          ...s.pageContents,
          [s.activePageId]: {
            nodes: s.nodes,
            edges: s.edges,
            groups: s.groups,
            scenarioDocument: s.scenarioDocument,
          },
        },
        nodes: [],
        edges: [],
        groups: [],
        scenarioDocument: createEmptyScenarioDocument(),
      }))
    );
    return id;
  },

  renamePage: (id, name) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, name } : p)),
    })),

  deletePage: (id) =>
    withHistoryReset(() =>
      set((s) => {
        if (s.pages.length <= 1 || !s.pages.some((p) => p.id === id)) return s;
        const pages = s.pages.filter((p) => p.id !== id);
        const contents = { ...s.pageContents };
        if (id !== s.activePageId) {
          delete contents[id];
          return { pages, pageContents: contents };
        }
        const oldIdx = s.pages.findIndex((p) => p.id === id);
        const next = pages[Math.max(0, oldIdx - 1)];
        const target = contents[next.id] ?? createEmptyPageContent();
        delete contents[next.id];
        return {
          pages,
          activePageId: next.id,
          pageContents: contents,
          nodes: target.nodes,
          edges: target.edges,
          groups: target.groups,
          scenarioDocument: target.scenarioDocument,
        };
      })
    ),

  setActivePage: (id) =>
    withHistoryReset(() =>
      set((s) => {
        if (id === s.activePageId || !s.pages.some((p) => p.id === id))
          return s;
        const contents = {
          ...s.pageContents,
          [s.activePageId]: {
            nodes: s.nodes,
            edges: s.edges,
            groups: s.groups,
            scenarioDocument: s.scenarioDocument,
          },
        };
        const target = contents[id] ?? createEmptyPageContent();
        delete contents[id];
        return {
          activePageId: id,
          pageContents: contents,
          nodes: target.nodes,
          edges: target.edges,
          groups: target.groups,
          scenarioDocument: target.scenarioDocument,
          animationPathDraft: null,
          editingTextNodeId: null,
        };
      })
    ),

  clear: () =>
    set({
      nodes: [],
      edges: [],
      groups: [],
      scenarioDocument: createEmptyScenarioDocument(),
      animationPathDraft: null,
      editingTextNodeId: null,
    }),

  resetWorkspace: async () => {
    try {
      await useFlowStore.persist.clearStorage();
    } catch {
      await idbDel("netviz-store-v1");
    }
    window.location.reload();
  },

  replaceDocument: (snapshot) =>
    withHistoryReset(() =>
      set({
        projectName: snapshot.projectName,
        nodes: snapshot.nodes,
        edges: normalizeEdgeAppearance(snapshot.edges),
        customBlocks: snapshot.customBlocks,
        groups: snapshot.groups,
        pages: snapshot.pages,
        activePageId: snapshot.activePageId,
        pageContents: Object.fromEntries(
          Object.entries(snapshot.pageContents).map(([pageId, content]) => [
            pageId,
            {
              ...content,
              edges: normalizeEdgeAppearance(content.edges),
              scenarioDocument: ensureTemplatePreviewScenarios(
                content.scenarioDocument
              ),
            },
          ])
        ),
        scenarioDocument: ensureTemplatePreviewScenarios(
          snapshot.scenarioDocument
        ),
        turbo: snapshot.turbo,
        turboColors: snapshot.turboColors,
        animationPathDraft: null,
        editingTextNodeId: null,
      })
    ),

  deleteElements: (input) =>
    set((s) => deleteAuthoredElements(s, input)),

  selectAll: () =>
    set((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: true })),
      edges: s.edges.map((e) => ({ ...e, selected: true })),
    })),

  deleteSelected: () => {
    const state = useFlowStore.getState();
    state.deleteElements({
      nodeIds: state.nodes.filter((node) => node.selected).map((node) => node.id),
      edgeIds: state.edges.filter((edge) => edge.selected).map((edge) => edge.id),
    });
  },

  toggleControls: () => set((s) => ({ showControls: !s.showControls })),
  toggleSmartGuides: () =>
    set((s) => ({ showSmartGuides: !s.showSmartGuides })),
  setMotionPreference: (motionPreference) => set({ motionPreference }),
  setVideoTitle: (videoTitle) => set({ videoTitle }),
  setVideoStartDelayMs: (delayMs) =>
    set({
      videoStartDelayMs: normalizeVideoDelay(delayMs, 3_000),
    }),
  setVideoBetweenDelayMs: (delayMs) =>
    set({
      videoBetweenDelayMs: normalizeVideoDelay(delayMs, 400),
    }),
  setVideoEndDelayMs: (delayMs) =>
    set({
      videoEndDelayMs: normalizeVideoDelay(delayMs, 0),
    }),
  setVideoCameraFollowEnabled: (videoCameraFollowEnabled) =>
    set({ videoCameraFollowEnabled }),
  setCanvasViewport: (canvasViewport) => set({ canvasViewport }),
  renderAllElements: false,
  setRenderAllElements: (v) => set({ renderAllElements: v }),
  setWorkMode: (mode) =>
    set((state) =>
      mode === "preview"
        ? {
            workMode: mode,
            previewReturnMode:
              state.workMode === "preview"
                ? state.previewReturnMode
                : state.workMode,
            animationPathDraft: null,
            editingTextNodeId: null,
            nodes: state.nodes.map((node) =>
              node.selected ? { ...node, selected: false } : node
            ),
            edges: state.edges.map((edge) =>
              edge.selected ? { ...edge, selected: false } : edge
            ),
          }
        : {
            workMode: mode,
            previewReturnMode: mode,
            ...(mode === "animation" ? {} : { animationPathDraft: null }),
            ...(mode === "design" ? {} : { editingTextNodeId: null }),
            ...(mode === "video"
              ? {
                  nodes: state.nodes.map((node) =>
                    node.selected ? { ...node, selected: false } : node
                  ),
                  edges: state.edges.map((edge) =>
                    edge.selected ? { ...edge, selected: false } : edge
                  ),
                }
              : {}),
          }
    ),
  exitPreview: () =>
    set((state) => ({ workMode: state.previewReturnMode })),
    }),
    {
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        groups: state.groups,
        customBlocks: state.customBlocks,
        scenarioDocument: state.scenarioDocument,
      }),
      limit: 100,
      equality: (a, b) =>
        a.nodes === b.nodes &&
        a.edges === b.edges &&
        a.groups === b.groups &&
        a.customBlocks === b.customBlocks &&
        a.scenarioDocument === b.scenarioDocument,
      handleSet: (handleSet) => {
        let t: ReturnType<typeof setTimeout> | null = null;
        return ((...args: Parameters<typeof handleSet>) => {
          if (t) clearTimeout(t);
          t = setTimeout(() => handleSet(...args), 300);
        }) as typeof handleSet;
      },
    }
    ),
    {
      name: "netviz-store-v1",
      storage: idbStorage,
      version: 2,
      migrate: (persisted, version) => {
        const previous = (persisted ?? {}) as Partial<Snapshot> & {
          animateEdges?: boolean;
          animationSpeed?: number;
        };
        if (version >= 2) return previous;
        const migrated = migrateFlowSnapshotV1({
          version: 1,
          projectName: previous.projectName,
          nodes: previous.nodes ?? [],
          edges: previous.edges ?? [],
          customBlocks: previous.customBlocks ?? [],
          groups: previous.groups ?? [],
          pages: previous.pages,
          activePageId: previous.activePageId,
          pageContents: previous.pageContents,
          turbo: previous.turbo,
          animateEdges: previous.animateEdges,
          animationSpeed: previous.animationSpeed,
          turboColors: previous.turboColors,
        });
        const { version: _snapshotVersion, ...authored } = migrated;
        return {
          ...previous,
          ...authored,
          motionPreference: previous.motionPreference ?? "system",
        };
      },
      // Older builds mutated node zIndex for layer ordering, which now
      // fights the array-order stacking. Strip any persisted zIndex so
      // paint order follows the array (and the Layers panel) again.
      merge: (persisted, current) => {
        const { videoAnimationGapMs: legacyAnimationGapMs, ...p } = (
          persisted ?? {}
        ) as Partial<Snapshot> & { videoAnimationGapMs?: unknown };
        const strip = (ns?: AppNode[]) =>
          ns?.map((n) => ({ ...n, zIndex: 0 }));
        const nodes = strip(p.nodes) ?? current.nodes;
        const edges = p.edges
          ? normalizeEdgeAppearance(p.edges)
          : normalizeEdgeAppearance(current.edges);
        const pageContents = p.pageContents
          ? Object.fromEntries(
              Object.entries(p.pageContents).map(([k, c]) => [
                k,
                {
                  ...c,
                  nodes: strip(c.nodes) ?? c.nodes,
                  edges: normalizeEdgeAppearance(c.edges),
                  scenarioDocument:
                    ensureTemplatePreviewScenarios(
                      normalizeGradientBeamDefaults(
                        c.scenarioDocument ?? createEmptyScenarioDocument()
                      )
                    ),
                },
              ])
            )
          : current.pageContents;
        return {
          ...current,
          ...p,
          nodes,
          edges,
          pageContents,
          scenarioDocument: ensureTemplatePreviewScenarios(
            normalizeGradientBeamDefaults(
              p.scenarioDocument ?? createEmptyScenarioDocument()
            )
          ),
          motionPreference: p.motionPreference ?? "system",
          videoTitle: p.videoTitle ?? "",
          videoStartDelayMs: normalizeVideoDelay(p.videoStartDelayMs, 3_000),
          videoBetweenDelayMs: normalizeVideoDelay(
            p.videoBetweenDelayMs,
            normalizeVideoDelay(legacyAnimationGapMs, 400)
          ),
          videoEndDelayMs: normalizeVideoDelay(p.videoEndDelayMs, 0),
          videoCameraFollowEnabled: p.videoCameraFollowEnabled ?? true,
          canvasViewport:
            p.canvasViewport &&
            Number.isFinite(p.canvasViewport.x) &&
            Number.isFinite(p.canvasViewport.y) &&
            Number.isFinite(p.canvasViewport.zoom) &&
            p.canvasViewport.zoom > 0
              ? p.canvasViewport
              : null,
          turboColors: p.turboColors ?? DEFAULT_TURBO_COLORS,
          edgeCurveStyle: p.edgeCurveStyle ?? "stepped",
          workMode:
            p.workMode === "animation" || p.workMode === "video"
              ? p.workMode
              : "design",
        };
      },
      partialize: (s) => ({
        projectName: s.projectName,
        nodes: s.nodes,
        edges: s.edges,
        customBlocks: s.customBlocks,
        groups: s.groups,
        pages: s.pages,
        activePageId: s.activePageId,
        pageContents: s.pageContents,
        scenarioDocument: s.scenarioDocument,
        turbo: s.turbo,
        turboColors: s.turboColors,
        edgeColor: s.edgeColor,
        edgeCurveStyle: s.edgeCurveStyle,
        edgeLineStyle: s.edgeLineStyle,
        edgeDashGap: s.edgeDashGap,
        showControls: s.showControls,
        showSmartGuides: s.showSmartGuides,
        motionPreference: s.motionPreference,
        videoTitle: s.videoTitle,
        videoStartDelayMs: s.videoStartDelayMs,
        videoBetweenDelayMs: s.videoBetweenDelayMs,
        videoEndDelayMs: s.videoEndDelayMs,
        videoCameraFollowEnabled: s.videoCameraFollowEnabled,
        canvasViewport: s.canvasViewport,
        workMode:
          s.workMode === "preview" ? s.previewReturnMode : s.workMode,
      }),
    }
  )
);

scenarioRuntime.activate("page-1", null);
function syncScenarioRuntime(
  state: FlowState,
  previous: FlowState,
  environmentChanged = false
) {
  if (
    !environmentChanged &&
    state.activePageId === previous.activePageId &&
    state.scenarioDocument === previous.scenarioDocument &&
    state.workMode === previous.workMode &&
    state.motionPreference === previous.motionPreference
  ) {
    return;
  }

  if (state.workMode === "design") {
    scenarioRuntime.activate(state.activePageId, null);
    return;
  }

  const scenario = getDefaultScenario(state.scenarioDocument);
  const lifecycleChanged =
    state.activePageId !== previous.activePageId ||
    state.workMode !== previous.workMode;
  if (lifecycleChanged) {
    scenarioRuntime.activate(state.activePageId, scenario);
  } else if (state.scenarioDocument !== previous.scenarioDocument) {
    scenarioRuntime.reconcile(state.activePageId, scenario);
  }

  const reduced = prefersReducedMotion(state.motionPreference);
  if (reduced) {
    scenarioRuntime.stop();
    scenarioRuntime.setLoop(false);
    return;
  }

  if (
    environmentChanged ||
    state.motionPreference !== previous.motionPreference
  ) {
    scenarioRuntime.setLoop(scenario?.playback.loop.mode === "repeat");
  }
  if (
    state.workMode === "preview" &&
    state.previewReturnMode !== "video" &&
    scenario !== null
  ) {
    scenarioRuntime.play();
  }
}

useFlowStore.subscribe((state, previous) =>
  syncScenarioRuntime(state, previous)
);

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
  motionMedia.addEventListener("change", () => {
    const state = useFlowStore.getState();
    if (state.motionPreference === "system") {
      syncScenarioRuntime(state, state, true);
    }
  });
}

export function resolveBlock(
  blockId: string,
  customBlocks: BlockDef[]
): BlockDef | undefined {
  return (
    CORE_BLOCKS.find((b) => b.id === blockId) ??
    customBlocks.find((b) => b.id === blockId)
  );
}

export function getNodeDisplayName(node: AppNode): string {
  const custom = node.data.name?.trim();
  if (custom) return custom;
  switch (node.type) {
    case "infra":
      return node.data.label || "Block";
    case "shape":
      return (
        node.data.label ||
        (node.data.shape === "circle" ? "Circle" : "Rectangle")
      );
    case "text":
      return (node.data.text || "Text").split("\n")[0].slice(0, 40);
    case "step":
      return node.data.label || `Step ${node.data.step}`;
    case "line":
      return "Line";
    case "image":
      return "Image";
    case "code":
      return node.data.label || `Code (${node.data.language})`;
  }
  return "Block";
}
