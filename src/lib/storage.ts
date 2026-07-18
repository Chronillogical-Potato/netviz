import type {
  FlowSnapshotV1,
  FlowSnapshotV2,
} from "@/animation/snapshot-migrations";
import {
  clearLegacyAnimatedFlags,
  migrateFlowSnapshotV1,
  normalizeFlowSnapshotV2,
} from "@/animation/snapshot-migrations";

export type FlowSnapshot = FlowSnapshotV2;

export { type FlowSnapshotV1, type FlowSnapshotV2 } from "@/animation/snapshot-migrations";

export function parseFlowSnapshot(input: string | unknown): FlowSnapshotV2 {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  if (!data || typeof data !== "object") throw new Error("Invalid snapshot shape");
  const version = (data as { version?: unknown }).version;
  if (version === 1) {
    const legacy = data as FlowSnapshotV1;
    if (!Array.isArray(legacy.nodes) || !Array.isArray(legacy.edges)) {
      throw new Error("Invalid snapshot shape");
    }
    return migrateFlowSnapshotV1(legacy);
  }
  if (version === 2) return normalizeFlowSnapshotV2(data);
  throw new Error("Unsupported file version");
}

export function createFlowSnapshot(
  source: Omit<FlowSnapshotV2, "version">
): FlowSnapshotV2 {
  const pageContents = Object.fromEntries(
    Object.entries(source.pageContents).map(([pageId, content]) => [
      pageId,
      { ...content, edges: clearLegacyAnimatedFlags(content.edges) },
    ])
  );
  return {
    version: 2,
    projectName: source.projectName,
    nodes: source.nodes,
    edges: clearLegacyAnimatedFlags(source.edges),
    customBlocks: source.customBlocks,
    groups: source.groups,
    pages: source.pages,
    activePageId: source.activePageId,
    pageContents,
    scenarioDocument: source.scenarioDocument,
    turbo: source.turbo,
    turboColors: source.turboColors,
  };
}

export function downloadSnapshot(snapshot: FlowSnapshot, filename?: string) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const base = (filename ?? `netviz-${Date.now()}`).trim() || "netviz";
  a.download = base.endsWith(".json") ? base : `${base}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function readSnapshotFromFile(file: File): Promise<FlowSnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseFlowSnapshot(String(reader.result)));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
