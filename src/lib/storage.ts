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

const SHARE_FORMAT = "v1";
const MAX_SHARE_PAYLOAD_CHARS = 2_000_000;
const MAX_SHARED_PROJECT_BYTES = 10_000_000;

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

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid Base64URL");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function compressProject(json: string) {
  const stream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressProject(bytes: Uint8Array) {
  const stream = new Blob([Uint8Array.from(bytes).buffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_SHARED_PROJECT_BYTES) {
      await reader.cancel();
      throw new Error("Shared project is too large");
    }
    chunks.push(value);
  }

  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

export async function createShareUrl(
  snapshot: FlowSnapshot,
  baseUrl = window.location.href
) {
  const compressed = await compressProject(JSON.stringify(snapshot));
  const payload = `${SHARE_FORMAT}.${bytesToBase64Url(compressed)}`;
  if (payload.length > MAX_SHARE_PAYLOAD_CHARS) {
    throw new Error(
      "This project is too large to share as a link. Save it as JSON instead."
    );
  }
  const url = new URL(baseUrl);
  const params = new URLSearchParams(url.hash.slice(1));
  params.set("share", payload);
  url.hash = params.toString();
  return url.toString();
}

export async function parseSharedProject(hash: string) {
  const payload = new URLSearchParams(hash.replace(/^#/, "")).get("share");
  if (!payload) return null;
  try {
    if (payload.length > MAX_SHARE_PAYLOAD_CHARS) {
      throw new Error("Shared project is too large");
    }
    const [format, encoded, ...extra] = payload.split(".");
    if (format !== SHARE_FORMAT || !encoded || extra.length > 0) {
      throw new Error("Unsupported share format");
    }
    const json = await decompressProject(base64UrlToBytes(encoded));
    return parseFlowSnapshot(json);
  } catch (error) {
    throw new Error("Could not read shared project", { cause: error });
  }
}

export function urlWithoutSharePayload(input: string) {
  const url = new URL(input);
  const params = new URLSearchParams(url.hash.slice(1));
  params.delete("share");
  const hash = params.toString();
  return `${url.pathname}${url.search}${hash ? `#${hash}` : ""}`;
}

export function hasWorkspaceContent(snapshot: FlowSnapshot) {
  if (snapshot.projectName.trim() !== "Untitled") return true;
  if (
    snapshot.nodes.length > 0 ||
    snapshot.edges.length > 0 ||
    snapshot.customBlocks.length > 0 ||
    snapshot.groups.length > 0 ||
    snapshot.pages.length > 1 ||
    snapshot.turbo
  ) {
    return true;
  }
  const page = snapshot.pages[0];
  if (page.name !== "Page 1" || page.bgColor) return true;
  if (snapshot.scenarioDocument.scenarios.length > 0) return true;
  return Object.values(snapshot.pageContents).some(
    (content) =>
      content.nodes.length > 0 ||
      content.edges.length > 0 ||
      content.groups.length > 0 ||
      content.scenarioDocument.scenarios.length > 0
  );
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
