import { beforeEach, describe, expect, test } from "bun:test";
import { createEmptyScenarioDocument } from "../src/animation/scenario-document";
import { scenarioRuntime } from "../src/animation/runtime-instance";
import type { FlowSnapshotV2 } from "../src/animation/snapshot-migrations";
import {
  DEFAULT_TURBO_COLORS,
  useFlowStore,
  type AppNode,
  type LabeledEdge,
} from "../src/store/flow-store";

const node = (id: string, selected = false): AppNode =>
  ({
    id,
    type: "shape",
    position: { x: 0, y: 0 },
    selected,
    data: { shape: "rectangle" },
  }) as AppNode;

const edge = (id: string, source: string, target: string, selected = false) =>
  ({
    id,
    type: "labeled",
    source,
    target,
    selected,
    animated: false,
    data: { lineStyle: "solid" },
  }) as LabeledEdge;

function resetStore() {
  const temporal = useFlowStore.temporal.getState();
  temporal.pause();
  useFlowStore.setState({
    projectName: "Test",
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
    edgeLineStyle: "solid",
    edgeDashGap: 6,
    showControls: true,
    showSmartGuides: true,
    motionPreference: "system",
    workMode: "design",
  });
  temporal.clear();
  temporal.resume();
}

beforeEach(resetStore);

describe("page-owned animation state", () => {
  test("swaps scenario documents with the active page", () => {
    useFlowStore.setState({ edges: [edge("edge-a", "a", "b", true)] });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.packet",
      params: { direction: "forward" },
    });
    const firstPageDocument = useFlowStore.getState().scenarioDocument;

    const page2 = useFlowStore.getState().addPage();
    expect(useFlowStore.getState()).toMatchObject({
      activePageId: page2,
      scenarioDocument: {
        defaultScenarioId: null,
        scenarios: [],
      },
    });

    useFlowStore.getState().setActivePage("page-1");
    expect(useFlowStore.getState().scenarioDocument).toEqual(firstPageDocument);
  });

  test("records effect edits in the same undo history as graph edits", async () => {
    useFlowStore.setState({ edges: [edge("edge-a", "a", "b", true)] });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.pulse",
      params: { direction: "forward" },
    });
    await Bun.sleep(350);
    expect(useFlowStore.getState().scenarioDocument.scenarios).toHaveLength(1);

    useFlowStore.temporal.getState().undo();
    expect(useFlowStore.getState().scenarioDocument.scenarios).toHaveLength(0);
    useFlowStore.temporal.getState().redo();
    expect(useFlowStore.getState().scenarioDocument.scenarios).toHaveLength(1);
  });

  test("resets the ephemeral runtime across mode and page lifecycles", () => {
    useFlowStore.setState({ edges: [edge("edge-a", "a", "b", true)] });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.packet",
      params: { direction: "forward" },
    });
    useFlowStore.getState().setWorkMode("animation");
    expect(scenarioRuntime.getTransportSnapshot()).toMatchObject({
      pageId: "page-1",
      scenarioId: useFlowStore.getState().scenarioDocument.defaultScenarioId,
      currentTimeMs: 0,
      isPlaying: false,
    });

    scenarioRuntime.play();
    expect(scenarioRuntime.getTransportSnapshot().isPlaying).toBe(true);
    const page2 = useFlowStore.getState().addPage();
    expect(scenarioRuntime.getTransportSnapshot()).toMatchObject({
      pageId: page2,
      scenarioId: null,
      currentTimeMs: 0,
      isPlaying: false,
    });
  });

  test("honors reduced motion before Preview autoplay", () => {
    useFlowStore.setState({ edges: [edge("edge-a", "a", "b", true)] });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.pulse",
      params: { direction: "forward" },
    });
    useFlowStore.getState().setMotionPreference("reduced");
    useFlowStore.getState().setWorkMode("preview");
    expect(scenarioRuntime.getTransportSnapshot()).toMatchObject({
      currentTimeMs: 0,
      isPlaying: false,
      loop: false,
    });

    useFlowStore.getState().setMotionPreference("full");
    expect(scenarioRuntime.getTransportSnapshot().isPlaying).toBe(true);
    useFlowStore.getState().setWorkMode("design");
    expect(scenarioRuntime.getTransportSnapshot()).toMatchObject({
      scenarioId: null,
      currentTimeMs: 0,
      isPlaying: false,
    });
  });

  test("preserves transport time when editing the active Animation scenario", () => {
    useFlowStore.setState({ edges: [edge("edge-a", "a", "b", true)] });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.packet",
      params: { direction: "forward" },
    });
    useFlowStore.getState().setWorkMode("animation");
    scenarioRuntime.seek(500);
    scenarioRuntime.play();

    useFlowStore.getState().patchSelectedEdgeEffects({ durationMs: 2_000 });
    expect(scenarioRuntime.getTransportSnapshot()).toMatchObject({
      currentTimeMs: 500,
      isPlaying: true,
    });
  });
});

describe("animation target lifecycle", () => {
  test("duplicates internal edge tracks with fresh target, track, and clip IDs", () => {
    useFlowStore.setState({
      nodes: [node("a", true), node("b", true)],
      edges: [edge("edge-a", "a", "b", true)],
    });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.gradient-beam",
      params: { direction: "forward" },
    });
    const beforeTrack =
      useFlowStore.getState().scenarioDocument.scenarios[0].tracks[0];

    useFlowStore.getState().duplicateNodes(["a", "b"]);
    const copiedEdge = useFlowStore
      .getState()
      .edges.find((candidate) => candidate.id !== "edge-a");
    expect(copiedEdge).toBeDefined();
    const copiedTrack = useFlowStore
      .getState()
      .scenarioDocument.scenarios[0].tracks.find(
        (track) =>
          track.target.type === "edge" &&
          "id" in track.target &&
          track.target.id === copiedEdge?.id
      );
    expect(copiedTrack).toBeDefined();
    expect(copiedTrack?.id).not.toBe(beforeTrack.id);
    expect(copiedTrack?.clips[0].id).not.toBe(beforeTrack.clips[0].id);
  });

  test("prunes node, incident-edge, and selected-edge targets atomically", () => {
    useFlowStore.setState({
      nodes: [node("a", true), node("b")],
      edges: [edge("edge-a", "a", "b", true)],
    });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.moving-dash",
      params: { direction: "forward" },
    });

    useFlowStore.getState().deleteElements({ nodeIds: ["a"] });
    expect(useFlowStore.getState().nodes.map((item) => item.id)).toEqual(["b"]);
    expect(useFlowStore.getState().edges).toHaveLength(0);
    expect(
      useFlowStore.getState().scenarioDocument.scenarios[0].tracks
    ).toHaveLength(0);
  });

  test("prunes incident edge targets from a direct React Flow node removal", () => {
    useFlowStore.setState({
      nodes: [node("a"), node("b")],
      edges: [edge("edge-a", "a", "b", true)],
    });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.moving-dash",
      params: { direction: "forward" },
    });

    useFlowStore.getState().onNodesChange([{ type: "remove", id: "a" }]);

    expect(useFlowStore.getState().nodes.map((item) => item.id)).toEqual(["b"]);
    expect(useFlowStore.getState().edges).toHaveLength(0);
    expect(
      useFlowStore.getState().scenarioDocument.scenarios[0].tracks
    ).toHaveLength(0);
  });

  test("prunes targets from a direct React Flow edge removal", () => {
    useFlowStore.setState({
      nodes: [node("a"), node("b")],
      edges: [edge("edge-a", "a", "b", true)],
    });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.packet",
      params: { direction: "forward" },
    });

    useFlowStore.getState().onEdgesChange([
      { type: "remove", id: "edge-a" },
    ]);

    expect(useFlowStore.getState().nodes.map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(useFlowStore.getState().edges).toHaveLength(0);
    expect(
      useFlowStore.getState().scenarioDocument.scenarios[0].tracks
    ).toHaveLength(0);
  });

  test("broadcasts authored fields to selected effects without animating missing ones", () => {
    useFlowStore.setState({
      nodes: [node("a"), node("b"), node("c")],
      edges: [
        edge("edge-a", "a", "b", true),
        edge("edge-b", "b", "c", true),
      ],
    });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.packet",
      params: { direction: "forward", sizePx: 6 },
    });
    useFlowStore.getState().patchSelectedEdgeEffects({ durationMs: 2_000 });

    expect(
      useFlowStore
        .getState()
        .scenarioDocument.scenarios[0].tracks.map(
          (track) => track.clips[0].durationMs
        )
    ).toEqual([2_000, 2_000]);

    useFlowStore.setState((state) => ({
      edges: state.edges.map((item) =>
        item.id === "edge-b" ? { ...item, selected: false } : item
      ),
    }));
    useFlowStore.getState().removeSelectedEdgeEffects();
    useFlowStore.setState((state) => ({
      edges: state.edges.map((item) => ({
        ...item,
        selected: item.id === "edge-b",
      })),
    }));
    useFlowStore.getState().patchSelectedEdgeEffects({ startMs: 500 });
    expect(
      useFlowStore.getState().scenarioDocument.scenarios[0].tracks
    ).toHaveLength(1);
  });
});

describe("document replacement", () => {
  test("fully replaces authored scenarios and clears prior undo history", () => {
    useFlowStore.setState({ edges: [edge("old", "a", "b", true)] });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.pulse",
      params: { direction: "forward" },
    });
    const snapshot: FlowSnapshotV2 = {
      version: 2,
      projectName: "Loaded",
      nodes: [],
      edges: [],
      customBlocks: [],
      groups: [],
      pages: [{ id: "loaded-page", name: "Loaded" }],
      activePageId: "loaded-page",
      pageContents: {},
      scenarioDocument: createEmptyScenarioDocument(),
      turbo: false,
      turboColors: DEFAULT_TURBO_COLORS,
    };

    useFlowStore.getState().replaceDocument(snapshot);
    expect(useFlowStore.getState()).toMatchObject({
      projectName: "Loaded",
      activePageId: "loaded-page",
      edges: [],
      scenarioDocument: { scenarios: [] },
    });
    expect(useFlowStore.temporal.getState().pastStates).toHaveLength(0);
  });
});
