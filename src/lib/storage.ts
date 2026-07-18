import type { BlockDef } from "@/blocks/registry";
import type {
  AppNode,
  Group,
  LabeledEdge,
  Page,
  PageContent,
} from "@/store/flow-store";

export type FlowSnapshot = {
  version: 1;
  projectName?: string;
  nodes: AppNode[];
  edges: LabeledEdge[];
  customBlocks: BlockDef[];
  groups?: Group[];
  pages?: Page[];
  activePageId?: string;
  pageContents?: Record<string, PageContent>;
  turbo?: boolean;
  animateEdges?: boolean;
  animationSpeed?: number;
  turboColors?: [string, string];
};

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
        const data = JSON.parse(String(reader.result)) as FlowSnapshot;
        if (data.version !== 1) throw new Error("Unsupported file version");
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
          throw new Error("Invalid snapshot shape");
        }
        resolve(data);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
