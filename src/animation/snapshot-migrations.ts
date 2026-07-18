import type { BlockDef } from "@/blocks/registry";
import type {
  AppNode,
  Group,
  LabeledEdge,
  Page,
} from "@/store/flow-store";
import type {
  JsonObject,
  PageScenarioDocumentV1,
  ScenarioClipV1,
  ScenarioTrackV1,
  ScenarioV1,
} from "./model";

export type LegacyPageContentV1 = {
  nodes: AppNode[];
  edges: LabeledEdge[];
  groups: Group[];
};

export type PageContentV2 = LegacyPageContentV1 & {
  scenarioDocument: PageScenarioDocumentV1;
};

export type FlowSnapshotV1 = {
  version: 1;
  projectName?: string;
  nodes: AppNode[];
  edges: LabeledEdge[];
  customBlocks?: BlockDef[];
  groups?: Group[];
  pages?: Page[];
  activePageId?: string;
  pageContents?: Record<string, LegacyPageContentV1>;
  turbo?: boolean;
  animateEdges?: boolean;
  animationSpeed?: number;
  turboColors?: [string, string];
};

export type FlowSnapshotV2 = {
  version: 2;
  projectName: string;
  nodes: AppNode[];
  edges: LabeledEdge[];
  customBlocks: BlockDef[];
  groups: Group[];
  pages: Page[];
  activePageId: string;
  pageContents: Record<string, PageContentV2>;
  scenarioDocument: PageScenarioDocumentV1;
  turbo: boolean;
  turboColors: [string, string];
};

const DEFAULT_TURBO_COLORS: [string, string] = ["#ec4899", "#3b82f6"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyScenarioDocument(): PageScenarioDocumentV1 {
  return { schemaVersion: 1, scenarios: [], defaultScenarioId: null };
}

function assertCollection(value: unknown, message = "Invalid snapshot shape") {
  if (!Array.isArray(value)) throw new Error(message);
}

function normalizeScenarioDocument(
  value: unknown
): PageScenarioDocumentV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Unsupported scenario schema version");
  }
  assertCollection(value.scenarios, "Invalid scenario document shape");
  if (
    value.defaultScenarioId !== null &&
    typeof value.defaultScenarioId !== "string"
  ) {
    throw new Error("Invalid scenario document shape");
  }
  for (const scenario of value.scenarios as unknown[]) {
    if (!isRecord(scenario)) throw new Error("Invalid scenario document shape");
    assertCollection(scenario.tracks, "Invalid scenario document shape");
    assertCollection(scenario.markers, "Invalid scenario document shape");
    assertCollection(scenario.triggers, "Invalid scenario document shape");
    for (const track of scenario.tracks as unknown[]) {
      if (!isRecord(track)) throw new Error("Invalid scenario document shape");
      assertCollection(track.clips, "Invalid scenario document shape");
      for (const clip of track.clips as unknown[]) {
        if (!isRecord(clip) || !isRecord(clip.effect)) {
          throw new Error("Invalid scenario document shape");
        }
        if (typeof clip.effect.type !== "string" || !isRecord(clip.effect.params)) {
          throw new Error("Invalid scenario document shape");
        }
      }
    }
  }
  return value as unknown as PageScenarioDocumentV1;
}

function legacyDurationMs(animationSpeed: unknown): number {
  if (
    typeof animationSpeed === "number" &&
    Number.isFinite(animationSpeed) &&
    animationSpeed > 0
  ) {
    return Math.max(1, Math.round(animationSpeed * 1_000));
  }
  return 800;
}

function migratePage(
  pageId: string,
  edges: LabeledEdge[],
  durationMs: number
): { edges: LabeledEdge[]; scenarioDocument: PageScenarioDocumentV1 } {
  const animated = edges.filter((edge) => edge.animated === true);
  const normalizedEdges = edges.map((edge) =>
    edge.animated === false
      ? edge
      : ({ ...edge, animated: false } as LabeledEdge)
  );

  if (animated.length === 0) {
    return { edges: normalizedEdges, scenarioDocument: emptyScenarioDocument() };
  }

  const tracks: ScenarioTrackV1[] = animated.map((edge) => {
    const params: JsonObject = {
      direction: "forward",
      color: edge.data?.color ?? "#94a3b8",
      widthPx: 2,
      opacity: 1,
      dashLengthPx: edge.data?.dashGap ?? 6,
      gapLengthPx: edge.data?.dashGap ?? 6,
    };
    const clip: ScenarioClipV1 = {
      id: `legacy-clip-${edge.id}`,
      startMs: 0,
      durationMs,
      easing: "linear",
      repeatCount: 0,
      repeatDelayMs: 0,
      effect: { type: "edge.moving-dash", params },
    };
    return {
      id: `legacy-track-${edge.id}`,
      target: { type: "edge", id: edge.id },
      property: "connection-effect",
      enabled: true,
      clips: [clip],
    };
  });

  const scenarioId = `legacy-motion-${pageId}`;
  const scenario: ScenarioV1 = {
    id: scenarioId,
    name: "Legacy edge motion",
    durationMs,
    playback: {
      rate: 1,
      loop: { mode: "repeat", startMs: 0, endMs: durationMs },
    },
    tracks,
    markers: [],
    triggers: [],
  };

  return {
    edges: normalizedEdges,
    scenarioDocument: {
      schemaVersion: 1,
      scenarios: [scenario],
      defaultScenarioId: scenarioId,
    },
  };
}

export function migrateFlowSnapshotV1(input: FlowSnapshotV1): FlowSnapshotV2 {
  assertCollection(input.nodes);
  assertCollection(input.edges);
  const pages =
    Array.isArray(input.pages) && input.pages.length > 0
      ? input.pages
      : [{ id: "page-1", name: "Page 1" }];
  const activePageId =
    typeof input.activePageId === "string" &&
    pages.some((page) => page.id === input.activePageId)
      ? input.activePageId
      : pages[0].id;
  const durationMs = legacyDurationMs(input.animationSpeed);
  const active = migratePage(activePageId, input.edges, durationMs);
  const pageContents: Record<string, PageContentV2> = {};

  if (input.pageContents && isRecord(input.pageContents)) {
    for (const [pageId, content] of Object.entries(input.pageContents)) {
      if (!isRecord(content)) throw new Error("Invalid snapshot shape");
      assertCollection(content.nodes);
      assertCollection(content.edges);
      assertCollection(content.groups);
      const migrated = migratePage(
        pageId,
        content.edges as LabeledEdge[],
        durationMs
      );
      pageContents[pageId] = {
        nodes: content.nodes as AppNode[],
        edges: migrated.edges,
        groups: content.groups as Group[],
        scenarioDocument: migrated.scenarioDocument,
      };
    }
  }

  return {
    version: 2,
    projectName: input.projectName ?? "Untitled",
    nodes: input.nodes,
    edges: active.edges,
    customBlocks: Array.isArray(input.customBlocks) ? input.customBlocks : [],
    groups: Array.isArray(input.groups) ? input.groups : [],
    pages,
    activePageId,
    pageContents,
    scenarioDocument: active.scenarioDocument,
    turbo: input.turbo ?? false,
    turboColors:
      Array.isArray(input.turboColors) && input.turboColors.length === 2
        ? input.turboColors
        : DEFAULT_TURBO_COLORS,
  };
}

export function normalizeFlowSnapshotV2(input: unknown): FlowSnapshotV2 {
  if (!isRecord(input) || input.version !== 2) {
    throw new Error("Unsupported file version");
  }
  assertCollection(input.nodes);
  assertCollection(input.edges);
  assertCollection(input.customBlocks);
  assertCollection(input.groups);
  assertCollection(input.pages);
  if (typeof input.activePageId !== "string" || !isRecord(input.pageContents)) {
    throw new Error("Invalid snapshot shape");
  }
  const pages = input.pages as unknown[];
  if (
    pages.length === 0 ||
    pages.some(
      (page) =>
        !isRecord(page) ||
        typeof page.id !== "string" ||
        typeof page.name !== "string"
    ) ||
    !pages.some(
      (page) => isRecord(page) && page.id === input.activePageId
    )
  ) {
    throw new Error("Invalid snapshot shape");
  }

  const pageContents: Record<string, PageContentV2> = {};
  for (const [pageId, content] of Object.entries(input.pageContents)) {
    if (!isRecord(content)) throw new Error("Invalid snapshot shape");
    assertCollection(content.nodes);
    assertCollection(content.edges);
    assertCollection(content.groups);
    pageContents[pageId] = {
      nodes: content.nodes as AppNode[],
      edges: content.edges as LabeledEdge[],
      groups: content.groups as Group[],
      scenarioDocument: normalizeScenarioDocument(content.scenarioDocument),
    };
  }

  const turboColors = input.turboColors;
  if (!Array.isArray(turboColors) || turboColors.length !== 2) {
    throw new Error("Invalid snapshot shape");
  }

  return {
    version: 2,
    projectName:
      typeof input.projectName === "string" ? input.projectName : "Untitled",
    nodes: input.nodes as AppNode[],
    edges: input.edges as LabeledEdge[],
    customBlocks: input.customBlocks as BlockDef[],
    groups: input.groups as Group[],
    pages: input.pages as Page[],
    activePageId: input.activePageId,
    pageContents,
    scenarioDocument: normalizeScenarioDocument(input.scenarioDocument),
    turbo: input.turbo === true,
    turboColors: turboColors as [string, string],
  };
}
