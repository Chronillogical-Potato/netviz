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
    animationPathDraft: null,
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
    useFlowStore.setState({
      nodes: [node("a", true), node("b")],
      edges: [edge("edge-a", "a", "b", true)],
    });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.pulse",
      params: { direction: "forward" },
    });
    useFlowStore.getState().setMotionPreference("reduced");
    useFlowStore.getState().setWorkMode("preview");
    expect(useFlowStore.getState().nodes.some((item) => item.selected)).toBe(
      false
    );
    expect(useFlowStore.getState().edges.some((item) => item.selected)).toBe(
      false
    );
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
  test("animates every connection with one short gradient beam", () => {
    useFlowStore.setState({
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("edge-a", "a", "b"), edge("edge-b", "b", "c")],
    });

    useFlowStore.getState().animateAllEdges();

    const scenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    expect(scenario.durationMs).toBe(1_500);
    expect(scenario.playback.loop).toEqual({
      mode: "repeat",
      startMs: 0,
      endMs: 1_500,
    });
    expect(
      scenario.tracks.map((track) => ({
        target: "id" in track.target ? track.target.id : null,
        startMs: track.clips[0].startMs,
        durationMs: track.clips[0].durationMs,
        easing: track.clips[0].easing,
        type: track.clips[0].effect.type,
      }))
    ).toEqual([
      {
        target: "edge-a",
        startMs: 0,
        durationMs: 1_500,
        easing: "linear",
        type: "edge.gradient-beam",
      },
      {
        target: "edge-b",
        startMs: 0,
        durationMs: 1_500,
        easing: "linear",
        type: "edge.gradient-beam",
      },
    ]);
  });

  test("builds a staggered request chain from the selected start block", () => {
    useFlowStore.setState({
      nodes: [node("user", true), node("firewall"), node("proxy"), node("server"), node("db")],
      edges: [
        edge("user-firewall", "user", "firewall"),
        edge("firewall-proxy", "firewall", "proxy"),
        edge("proxy-server", "proxy", "server"),
        edge("unrelated", "db", "server"),
      ],
    });

    useFlowStore.getState().animateRequestFlow("user");

    const scenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    expect(scenario.durationMs).toBe(7_100);
    expect(
      scenario.tracks
        .filter((track) => track.property === "connection-effect")
        .map((track) => [
          "id" in track.target ? track.target.id : null,
          track.clips[0].startMs,
        ])
    ).toEqual([
      ["user-firewall", 800],
      ["firewall-proxy", 2_900],
      ["proxy-server", 5_000],
    ]);
    expect(
      scenario.tracks
        .filter((track) => track.property === "node-effect")
        .map((track) => [
          "id" in track.target ? track.target.id : null,
          track.clips[0].startMs,
        ])
    ).toEqual([
      ["user", 0],
      ["firewall", 2_100],
      ["proxy", 4_200],
      ["server", 6_300],
    ]);
  });

  test("chains only the specifically selected path", () => {
    useFlowStore.setState({
      nodes: [node("user"), node("firewall"), node("proxy"), node("server")],
      edges: [
        edge("user-firewall", "user", "firewall"),
        edge("firewall-proxy", "firewall", "proxy", true),
        edge("proxy-server", "proxy", "server", true),
        edge("user-server", "user", "server"),
      ],
    });

    useFlowStore.getState().animateSelectedPath();

    const scenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    const edgeTracks = scenario.tracks.filter(
      (track) => track.property === "connection-effect"
    );
    expect(
      edgeTracks.map((track) => [
        "id" in track.target ? track.target.id : null,
        track.clips[0].startMs,
      ])
    ).toEqual([
      ["firewall-proxy", 0],
      ["proxy-server", 1_500],
    ]);
  });

  test("builds a directed custom path by clicking blocks in order", () => {
    useFlowStore.setState({
      nodes: [
        node("user", true),
        node("firewall"),
        node("proxy"),
        node("server"),
      ],
      edges: [
        edge("user-firewall", "user", "firewall", true),
        edge("firewall-proxy", "firewall", "proxy"),
        edge("proxy-server", "proxy", "server"),
        edge("user-server", "user", "server"),
      ],
    });

    useFlowStore.getState().beginAnimationPath("user");
    useFlowStore.getState().appendAnimationPathNode("firewall");
    useFlowStore.getState().appendAnimationPathNode("server");

    expect(useFlowStore.getState().animationPathDraft).toEqual({
      nodeIds: ["user", "firewall"],
      edgeIds: ["user-firewall"],
      error: "Choose a directly connected outgoing block.",
    });
    expect(useFlowStore.getState().nodes.every((item) => !item.selected)).toBe(
      true
    );
    expect(useFlowStore.getState().edges.every((item) => !item.selected)).toBe(
      true
    );
  });

  test("finishes each block shimmer before its outgoing edge starts", () => {
    useFlowStore.setState({
      nodes: [node("user"), node("firewall"), node("proxy")],
      edges: [
        edge("user-firewall", "user", "firewall"),
        edge("firewall-proxy", "firewall", "proxy"),
      ],
    });

    useFlowStore.getState().beginAnimationPath();
    useFlowStore.getState().appendAnimationPathNode("user");
    useFlowStore.getState().appendAnimationPathNode("firewall");
    useFlowStore.getState().appendAnimationPathNode("proxy");
    useFlowStore.getState().animateDraftPath();

    const scenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    const edgeTracks = scenario.tracks.filter(
      (track) => track.property === "connection-effect"
    );
    expect(
      edgeTracks.map((track) => [
        "id" in track.target ? track.target.id : null,
        track.clips[0].startMs,
      ])
    ).toEqual([
      ["user-firewall", 800],
      ["firewall-proxy", 2_900],
    ]);
    expect(
      scenario.tracks
        .filter((track) => track.property === "node-effect")
        .map((track) => [
          "id" in track.target ? track.target.id : null,
          track.clips[0].startMs,
          track.clips[0].durationMs,
        ])
    ).toEqual([
      ["user", 0, 800],
      ["firewall", 2_100, 800],
      ["proxy", 4_200, 800],
    ]);
    expect(scenario.durationMs).toBe(5_000);
    expect(useFlowStore.getState().animationPathDraft).toBeNull();

    useFlowStore.getState().editAnimationPath();
    expect(useFlowStore.getState().animationPathDraft).toEqual({
      nodeIds: ["user", "firewall", "proxy"],
      edgeIds: ["user-firewall", "firewall-proxy"],
      error: null,
    });
  });

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

  test("clears legacy CSS animation flags while hydrating version 2 state", () => {
    const merge = useFlowStore.persist.getOptions().merge;
    if (!merge) throw new Error("Expected persisted-state merge");
    const current = useFlowStore.getState();
    const hydrated = merge(
      {
        edges: [
          { ...edge("active-edge", "a", "b", false), animated: true },
        ],
        pageContents: {
          "page-2": {
            nodes: [],
            edges: [
              {
                ...edge("inactive-edge", "a", "b", false),
                animated: true,
              },
            ],
            groups: [],
            scenarioDocument: createEmptyScenarioDocument(),
          },
        },
      },
      current
    ) as typeof current;

    expect(hydrated.edges[0].animated).toBe(false);
    expect(hydrated.pageContents["page-2"].edges[0].animated).toBe(false);
  });

  test("updates the previous five-second beam default on hydration", () => {
    const merge = useFlowStore.persist.getOptions().merge;
    if (!merge) throw new Error("Expected persisted-state merge");
    useFlowStore.setState({ edges: [edge("edge-a", "a", "b", true)] });
    useFlowStore.getState().applySelectedEdgeEffect(
      {
        type: "edge.gradient-beam",
        params: { colors: ["#ffaa40", "#9c40ff"] },
      },
      {
        durationMs: 5_000,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }
    );
    const persisted = useFlowStore.getState().scenarioDocument;

    const hydrated = merge(
      { scenarioDocument: persisted },
      useFlowStore.getState()
    ) as ReturnType<typeof useFlowStore.getState>;
    const scenario = hydrated.scenarioDocument.scenarios[0];
    const clip = scenario.tracks[0].clips[0];

    expect(clip.durationMs).toBe(1_500);
    expect(clip.easing).toBe("linear");
    expect(scenario.durationMs).toBe(1_500);
    expect(scenario.playback.loop.endMs).toBe(1_500);
  });
});
