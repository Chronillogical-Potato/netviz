import { beforeEach, describe, expect, test } from "bun:test";
import { createEmptyScenarioDocument } from "../src/animation/scenario-document";
import { scenarioRuntime } from "../src/animation/runtime-instance";
import { findAuthoredCustomPaths } from "../src/animation/custom-path";
import type { FlowSnapshotV2 } from "../src/animation/snapshot-migrations";
import {
  DEFAULT_MARKER,
  DEFAULT_TURBO_COLORS,
  isAnimationCanvasMode,
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
    edgeCurveStyle: "stepped",
    edgeLineStyle: "solid",
    edgeDashGap: 6,
    showControls: true,
    showSmartGuides: true,
    motionPreference: "system",
    videoTitle: "",
    videoAnimationGapMs: 400,
    workMode: "design",
    previewReturnMode: "design",
    animationPathDraft: null,
  });
  temporal.clear();
  temporal.resume();
}

beforeEach(resetStore);

describe("edge appearance", () => {
  test("updates the label on every selected edge", () => {
    useFlowStore.setState({
      edges: [
        edge("edge-a", "a", "b", true),
        edge("edge-b", "b", "c", true),
        edge("edge-c", "c", "d"),
      ],
    });

    const setEdgeLabel = (
      useFlowStore.getState() as unknown as {
        setEdgeLabel?: (label: string) => void;
      }
    ).setEdgeLabel;
    expect(typeof setEdgeLabel).toBe("function");
    setEdgeLabel?.("Request");

    expect(
      useFlowStore.getState().edges.map((item) => item.data?.label)
    ).toEqual(["Request", "Request", undefined]);
  });

  test("applies a curve mode to selected edges and uses it for new edges", () => {
    useFlowStore.setState({
      edges: [
        edge("edge-a", "a", "b", true),
        edge("edge-b", "b", "c"),
      ],
    });

    const setEdgeCurveStyle = useFlowStore.getState().setEdgeCurveStyle;
    expect(typeof setEdgeCurveStyle).toBe("function");
    setEdgeCurveStyle?.("smooth");

    expect(useFlowStore.getState().edges.map((item) => item.data?.curveStyle)).toEqual([
      "smooth",
      undefined,
    ]);

    useFlowStore.setState((state) => ({
      edges: state.edges.map((item) => ({ ...item, selected: false })),
    }));
    setEdgeCurveStyle?.("smooth");
    useFlowStore.getState().onConnect({
      source: "c",
      target: "d",
      sourceHandle: null,
      targetHandle: null,
    });

    const state = useFlowStore.getState();
    expect(state.edgeCurveStyle).toBe("smooth");
    expect(state.edges.every((item) => item.data?.curveStyle === "smooth")).toBe(
      true
    );
  });

  test("keeps the arrow marker color synchronized with the edge color", () => {
    useFlowStore.setState({
      edges: [
        {
          ...edge("edge-a", "a", "b", true),
          markerEnd: DEFAULT_MARKER,
        },
      ],
    });

    useFlowStore.getState().setEdgeColor("#f43f5e");

    expect(useFlowStore.getState().edges[0]).toMatchObject({
      data: { color: "#f43f5e" },
      markerEnd: { color: "#f43f5e" },
    });
  });

  test("restores a color-matched arrow when turbo is disabled", () => {
    useFlowStore.setState({
      edges: [
        {
          ...edge("edge-a", "a", "b", true),
          markerEnd: undefined,
          data: { color: "#22c55e", lineStyle: "solid", turbo: true },
        },
      ],
    });

    useFlowStore.getState().toggleTurbo();

    expect(useFlowStore.getState().edges[0]).toMatchObject({
      data: { color: "#22c55e", turbo: false },
      markerEnd: { color: "#22c55e" },
    });
  });
});

describe("page-owned animation state", () => {
  test("uses animation canvas styling in preview mode", () => {
    expect(isAnimationCanvasMode("design")).toBe(false);
    expect(isAnimationCanvasMode("animation")).toBe(true);
    expect(isAnimationCanvasMode("video")).toBe(true);
    expect(isAnimationCanvasMode("preview")).toBe(true);
  });

  test("persists Video mode and returns clean preview to it", () => {
    useFlowStore.getState().setWorkMode("video");
    useFlowStore.getState().setWorkMode("preview");

    expect(useFlowStore.getState()).toMatchObject({
      workMode: "preview",
      previewReturnMode: "video",
    });

    useFlowStore.getState().exitPreview();
    expect(useFlowStore.getState().workMode).toBe("video");

    const merge = useFlowStore.persist.getOptions().merge;
    if (!merge) throw new Error("Expected persisted-state merge");
    const hydrated = merge(
      { workMode: "video" },
      useFlowStore.getState()
    ) as ReturnType<typeof useFlowStore.getState>;
    expect(hydrated.workMode).toBe("video");
  });

  test("persists the Video presentation title and animation gap", () => {
    const controls = useFlowStore.getState() as unknown as {
      setVideoTitle?: (title: string) => void;
      setVideoAnimationGapMs?: (gapMs: number) => void;
    };
    expect(typeof controls.setVideoTitle).toBe("function");
    expect(typeof controls.setVideoAnimationGapMs).toBe("function");

    controls.setVideoTitle?.("Production request flow");
    controls.setVideoAnimationGapMs?.(1_200);

    expect(useFlowStore.getState()).toMatchObject({
      videoTitle: "Production request flow",
      videoAnimationGapMs: 1_200,
    });

    const partialize = useFlowStore.persist.getOptions().partialize;
    if (!partialize) throw new Error("Expected persisted-state partialize");
    expect(partialize(useFlowStore.getState())).toMatchObject({
      videoTitle: "Production request flow",
      videoAnimationGapMs: 1_200,
    });
  });

  test("waits for the Video play action instead of autoplaying the mode", () => {
    useFlowStore.setState({
      nodes: [node("a"), node("b")],
      edges: [edge("edge-a", "a", "b", true)],
      motionPreference: "full",
    });
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.gradient-beam",
      params: { direction: "forward" },
    });

    useFlowStore.getState().setWorkMode("video");
    expect(scenarioRuntime.getTransportSnapshot().isPlaying).toBe(false);

    useFlowStore.getState().setWorkMode("preview");
    expect(scenarioRuntime.getTransportSnapshot().isPlaying).toBe(false);
  });

  test("returns clean preview to the editor mode it entered from", () => {
    useFlowStore.getState().setWorkMode("animation");
    useFlowStore.getState().setWorkMode("preview");

    expect(useFlowStore.getState()).toMatchObject({
      workMode: "preview",
      previewReturnMode: "animation",
    });

    useFlowStore.getState().exitPreview();
    expect(useFlowStore.getState().workMode).toBe("animation");
  });

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
  test("inserts a code-owned template with configured animations", () => {
    useFlowStore.getState().insertTemplate("load-balanced-web-app", {
      x: 120,
      y: 240,
    });

    const state = useFlowStore.getState();
    expect(state.nodes).toHaveLength(11);
    expect(state.edges).toHaveLength(17);
    expect(
      state.edges.every((item) => item.data?.curveStyle === "smooth")
    ).toBe(true);
    expect(Math.min(...state.nodes.map((item) => item.position.x))).toBe(120);
    expect(Math.min(...state.nodes.map((item) => item.position.y))).toBe(240);
    expect(state.scenarioDocument.scenarios.map((scenario) => scenario.name)).toEqual([
      "Load-balanced requests",
      "Cached request via App A",
      "Write request via App B",
      "Read request via App C",
      "Primary database replication",
      "Telemetry export",
    ]);
    expect(
      state.scenarioDocument.scenarios.slice(1).map(
        (scenario) =>
          scenario.tracks.filter(
            (track) => track.property === "connection-effect"
          ).length
      )
    ).toEqual([5, 5, 5, 1, 1]);

    const defaultScenario = state.scenarioDocument.scenarios.find(
      (scenario) => scenario.id === state.scenarioDocument.defaultScenarioId
    );
    const appA = state.nodes.find((item) => item.data.label === "App Server A");
    const appB = state.nodes.find((item) => item.data.label === "App Server B");
    const appC = state.nodes.find((item) => item.data.label === "App Server C");
    const edgeToA = state.edges.find((item) => item.target === appA?.id);
    const edgeToB = state.edges.find((item) => item.target === appB?.id);
    const edgeToC = state.edges.find((item) => item.target === appC?.id);
    const startsAt = (edgeId?: string) =>
      defaultScenario?.tracks.find(
        (track) => "id" in track.target && track.target.id === edgeId
      )?.clips[0]?.startMs;

    expect(defaultScenario?.name).toBe("Load-balanced requests");
    expect(startsAt(edgeToA?.id)).toBeNumber();
    expect(startsAt(edgeToB?.id)).toBeGreaterThan(startsAt(edgeToA?.id) ?? 0);
    expect(startsAt(edgeToC?.id)).toBeGreaterThan(startsAt(edgeToB?.id) ?? 0);
  });

  test("reorders custom paths without moving the template preview scenario", () => {
    useFlowStore.getState().insertTemplate("load-balanced-web-app", {
      x: 0,
      y: 0,
    });
    const state = useFlowStore.getState();
    const paths = findAuthoredCustomPaths(
      state.scenarioDocument,
      state.edges
    );

    useFlowStore
      .getState()
      .reorderAnimationPath(paths[1].scenarioId, paths[0].scenarioId);

    expect(
      useFlowStore
        .getState()
        .scenarioDocument.scenarios.map((scenario) => scenario.name)
    ).toEqual([
      "Load-balanced requests",
      "Write request via App B",
      "Cached request via App A",
      "Read request via App C",
      "Primary database replication",
      "Telemetry export",
    ]);
  });

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
      scenarioId: null,
      name: "Custom path 1",
      preset: "single-line",
      staggerMs: 0,
      appearance: {
        colors: ["#ffaa40", "#9c40ff"],
        responseColors: ["#38bdf8", "#818cf8"],
        widthPx: 2,
        beamLengthPx: 48,
        opacity: 1,
        glowBlurPx: 0,
        shimmer: true,
      },
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
        { ...edge("user-firewall", "user", "firewall"), targetHandle: "right" },
        { ...edge("firewall-proxy", "firewall", "proxy"), targetHandle: "top" },
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
          track.clips[0].effect.params.entrySide,
        ])
    ).toEqual([
      ["user", 0, 800, "left"],
      ["firewall", 2_100, 800, "right"],
      ["proxy", 4_200, 800, "top"],
    ]);
    expect(scenario.durationMs).toBe(5_000);
    expect(useFlowStore.getState().animationPathDraft).toBeNull();

    useFlowStore.getState().editAnimationPath();
    expect(useFlowStore.getState().animationPathDraft).toEqual({
      scenarioId: scenario.id,
      name: "Custom path 1",
      preset: "single-line",
      staggerMs: 0,
      appearance: {
        colors: ["#ffaa40", "#9c40ff"],
        responseColors: ["#38bdf8", "#818cf8"],
        widthPx: 2,
        beamLengthPx: 48,
        opacity: 1,
        glowBlurPx: 0,
        shimmer: true,
      },
      nodeIds: ["user", "firewall", "proxy"],
      edgeIds: ["user-firewall", "firewall-proxy"],
      error: null,
    });
  });

  test("allows a request path to return to an earlier block", () => {
    useFlowStore.setState({
      nodes: [node("provider"), node("container"), node("database")],
      edges: [
        edge("provider-container", "provider", "container"),
        edge("container-database", "container", "database"),
        edge("database-container", "database", "container"),
      ],
    });

    useFlowStore.getState().beginAnimationPath("provider");
    useFlowStore.getState().appendAnimationPathNode("container");
    useFlowStore.getState().appendAnimationPathNode("database");
    useFlowStore.getState().appendAnimationPathNode("container");

    expect(useFlowStore.getState().animationPathDraft).toMatchObject({
      nodeIds: ["provider", "container", "database", "container"],
      edgeIds: [
        "provider-container",
        "container-database",
        "database-container",
      ],
      error: null,
    });

    useFlowStore.getState().animateDraftPath();
    const scenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    const containerTrack = scenario.tracks.find(
      (track) =>
        track.property === "node-effect" &&
        "id" in track.target &&
        track.target.id === "container"
    );
    expect(containerTrack?.clips.map((clip) => clip.startMs)).toEqual([
      2_100,
      6_300,
    ]);
  });

  test("builds and reloads a bidirectional beam preset", () => {
    useFlowStore.setState({
      nodes: [node("client"), node("server")],
      edges: [edge("client-server", "client", "server")],
    });

    useFlowStore.getState().beginAnimationPath("client");
    useFlowStore.getState().setAnimationPathPreset("bidirectional");
    useFlowStore.getState().appendAnimationPathNode("server");
    useFlowStore.getState().animateDraftPath();

    const scenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    const edgeClip = scenario.tracks.find(
      (track) => track.property === "connection-effect"
    )?.clips[0];
    expect(edgeClip?.effect.params).toMatchObject({
      pathPreset: "bidirectional",
      direction: "bidirectional",
    });
    expect(
      scenario.tracks
        .filter((track) => track.property === "node-effect")
        .map((track) => track.clips[0].startMs)
    ).toEqual([0, 0]);

    useFlowStore.getState().editAnimationPath(scenario.id);
    expect(useFlowStore.getState().animationPathDraft).toMatchObject({
      preset: "bidirectional",
      nodeIds: ["client", "server"],
      edgeIds: ["client-server"],
    });
  });

  test("builds simultaneous multiple-input and multiple-output presets", () => {
    useFlowStore.setState({
      nodes: [node("hub"), node("a"), node("b")],
      edges: [
        edge("a-hub", "a", "hub"),
        edge("b-hub", "b", "hub"),
        edge("hub-a", "hub", "a"),
        edge("hub-b", "hub", "b"),
      ],
    });

    useFlowStore.getState().beginAnimationPath();
    useFlowStore.getState().setAnimationPathPreset("multiple-inputs");
    useFlowStore.getState().appendAnimationPathNode("hub");
    useFlowStore.getState().appendAnimationPathNode("a");
    useFlowStore.getState().appendAnimationPathNode("b");
    expect(useFlowStore.getState().animationPathDraft).toMatchObject({
      preset: "multiple-inputs",
      nodeIds: ["hub", "a", "b"],
      edgeIds: ["a-hub", "b-hub"],
    });
    useFlowStore.getState().animateDraftPath();

    const inputScenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    expect(
      inputScenario.tracks
        .filter((track) => track.property === "connection-effect")
        .map((track) => [
          "id" in track.target ? track.target.id : null,
          track.clips[0].startMs,
          track.clips[0].effect.params.pathPreset,
        ])
    ).toEqual([
      ["a-hub", 800, "multiple-inputs"],
      ["b-hub", 800, "multiple-inputs"],
    ]);

    useFlowStore.getState().beginAnimationPath();
    useFlowStore.getState().setAnimationPathPreset("multiple-outputs");
    useFlowStore.getState().appendAnimationPathNode("hub");
    useFlowStore.getState().appendAnimationPathNode("a");
    useFlowStore.getState().appendAnimationPathNode("b");
    useFlowStore.getState().animateDraftPath();

    const outputScenario = useFlowStore.getState().scenarioDocument.scenarios[1];
    expect(
      outputScenario.tracks
        .filter((track) => track.property === "connection-effect")
        .map((track) => [
          "id" in track.target ? track.target.id : null,
          track.clips[0].startMs,
          track.clips[0].effect.params.pathPreset,
        ])
    ).toEqual([
      ["hub-a", 800, "multiple-outputs"],
      ["hub-b", 800, "multiple-outputs"],
    ]);
  });

  test("plays a request forward and returns the response along the same path", () => {
    useFlowStore.setState({
      nodes: [node("client"), node("api"), node("database")],
      edges: [
        edge("client-api", "client", "api"),
        edge("api-database", "api", "database"),
      ],
    });

    useFlowStore.getState().beginAnimationPath();
    useFlowStore.getState().setAnimationPathPreset("request-response");
    useFlowStore.getState().setAnimationPathAppearance({
      responseColors: ["#22d3ee", "#2563eb"],
    });
    useFlowStore.getState().appendAnimationPathNode("client");
    useFlowStore.getState().appendAnimationPathNode("api");
    useFlowStore.getState().appendAnimationPathNode("database");
    useFlowStore.getState().animateDraftPath();

    const scenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    expect(
      scenario.tracks
        .filter((track) => track.property === "connection-effect")
        .map((track) => [
          "id" in track.target ? track.target.id : null,
          track.clips.map((clip) => [
            clip.startMs,
            clip.effect.params.direction,
          ]),
        ])
    ).toEqual([
      [
        "client-api",
        [
          [800, "forward"],
          [7_100, "reverse"],
        ],
      ],
      [
        "api-database",
        [
          [2_900, "forward"],
          [5_000, "reverse"],
        ],
      ],
    ]);
    expect(scenario.durationMs).toBe(9_200);
    expect(
      scenario.tracks
        .flatMap((track) => track.clips)
        .filter((clip) => clip.effect.params.direction === "reverse")
        .map((clip) => clip.effect.params.colors)
    ).toEqual([
      ["#22d3ee", "#2563eb"],
      ["#22d3ee", "#2563eb"],
    ]);

    useFlowStore.getState().editAnimationPath(scenario.id);
    expect(useFlowStore.getState().animationPathDraft).toMatchObject({
      preset: "request-response",
      nodeIds: ["client", "api", "database"],
      edgeIds: ["client-api", "api-database"],
      appearance: { responseColors: ["#22d3ee", "#2563eb"] },
    });
  });

  test("scatters to workers and gathers their responses", () => {
    useFlowStore.setState({
      nodes: [node("source"), node("a"), node("b"), node("result")],
      edges: [
        edge("source-a", "source", "a"),
        edge("source-b", "source", "b"),
        edge("a-result", "a", "result"),
        edge("b-result", "b", "result"),
      ],
    });

    useFlowStore.getState().beginAnimationPath();
    useFlowStore.getState().setAnimationPathPreset("scatter-gather");
    useFlowStore.getState().appendAnimationPathNode("source");
    useFlowStore.getState().appendAnimationPathNode("a");
    useFlowStore.getState().appendAnimationPathNode("b");
    useFlowStore.getState().appendAnimationPathNode("result");
    expect(useFlowStore.getState().animationPathDraft).toMatchObject({
      nodeIds: ["source", "a", "b", "result"],
      edgeIds: ["source-a", "source-b", "a-result", "b-result"],
    });
    useFlowStore.getState().animateDraftPath();

    const scenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    expect(
      scenario.tracks
        .filter((track) => track.property === "connection-effect")
        .map((track) => [
          "id" in track.target ? track.target.id : null,
          track.clips[0].startMs,
          track.clips[0].effect.params.pathPhase,
        ])
    ).toEqual([
      ["source-a", 800, "scatter"],
      ["source-b", 800, "scatter"],
      ["a-result", 2_900, "gather"],
      ["b-result", 2_900, "gather"],
    ]);

    useFlowStore.getState().editAnimationPath(scenario.id);
    expect(useFlowStore.getState().animationPathDraft).toMatchObject({
      preset: "scatter-gather",
      nodeIds: ["source", "a", "b", "result"],
      edgeIds: ["source-a", "source-b", "a-result", "b-result"],
    });
  });

  test("supports round-robin, staggered multiple-output, and failover schedules", () => {
    const graph = {
      nodes: [node("router"), node("a"), node("b")],
      edges: [
        edge("router-a", "router", "a"),
        edge("router-b", "router", "b"),
      ],
    };
    useFlowStore.setState(graph);

    const buildOutputs = (
      preset: "round-robin" | "multiple-outputs" | "failover"
    ) => {
      useFlowStore.getState().beginAnimationPath();
      useFlowStore.getState().setAnimationPathPreset(preset);
      useFlowStore.getState().appendAnimationPathNode("router");
      useFlowStore.getState().appendAnimationPathNode("a");
      useFlowStore.getState().appendAnimationPathNode("b");
    };

    buildOutputs("round-robin");
    useFlowStore.getState().animateDraftPath();
    buildOutputs("multiple-outputs");
    useFlowStore.getState().setAnimationPathStaggerMs(400);
    useFlowStore.getState().animateDraftPath();
    buildOutputs("failover");
    useFlowStore.getState().animateDraftPath();

    const scenarios = useFlowStore.getState().scenarioDocument.scenarios;
    const edgeStarts = (index: number) =>
      scenarios[index].tracks
        .filter((track) => track.property === "connection-effect")
        .map((track) => track.clips[0].startMs);
    expect(edgeStarts(0)).toEqual([800, 2_900]);
    expect(edgeStarts(1)).toEqual([800, 1_200]);
    expect(edgeStarts(2)).toEqual([800, 2_900]);
    expect(
      scenarios[1].tracks
        .filter((track) => track.property === "connection-effect")
        .map((track) => track.clips[0].effect.params.staggerMs)
    ).toEqual([400, 400]);
    expect(
      scenarios[2].tracks
        .find(
          (track) =>
            track.property === "node-effect" &&
            "id" in track.target &&
            track.target.id === "a"
        )
        ?.clips[0].effect.params.colors
    ).toEqual(["#fb7185", "#ef4444"]);

    useFlowStore.getState().editAnimationPath(scenarios[1].id);
    expect(useFlowStore.getState().animationPathDraft).toMatchObject({
      preset: "multiple-outputs",
      staggerMs: 400,
      nodeIds: ["router", "a", "b"],
    });
  });

  test("builds cascading trees and closed loops", () => {
    useFlowStore.setState({
      nodes: [node("root"), node("a"), node("b"), node("c")],
      edges: [
        edge("root-a", "root", "a"),
        edge("root-b", "root", "b"),
        edge("a-c", "a", "c"),
        edge("c-root", "c", "root"),
      ],
    });

    useFlowStore.getState().beginAnimationPath();
    useFlowStore.getState().setAnimationPathPreset("cascade");
    useFlowStore.getState().appendAnimationPathNode("root");
    useFlowStore.getState().appendAnimationPathNode("a");
    useFlowStore.getState().appendAnimationPathNode("b");
    useFlowStore.getState().appendAnimationPathNode("c");
    useFlowStore.getState().animateDraftPath();

    useFlowStore.getState().beginAnimationPath();
    useFlowStore.getState().setAnimationPathPreset("loop");
    useFlowStore.getState().appendAnimationPathNode("root");
    useFlowStore.getState().appendAnimationPathNode("a");
    useFlowStore.getState().appendAnimationPathNode("c");
    useFlowStore.getState().appendAnimationPathNode("root");
    useFlowStore.getState().animateDraftPath();

    const scenarios = useFlowStore.getState().scenarioDocument.scenarios;
    expect(
      scenarios[0].tracks
        .filter((track) => track.property === "connection-effect")
        .map((track) => [
          "id" in track.target ? track.target.id : null,
          track.clips[0].startMs,
        ])
    ).toEqual([
      ["root-a", 800],
      ["root-b", 800],
      ["a-c", 2_900],
    ]);
    expect(
      scenarios[1].tracks
        .filter((track) => track.property === "connection-effect")
        .map((track) => [
          "id" in track.target ? track.target.id : null,
          track.clips[0].startMs,
        ])
    ).toEqual([
      ["root-a", 800],
      ["a-c", 2_900],
      ["c-root", 5_000],
    ]);

    useFlowStore.getState().editAnimationPath(scenarios[0].id);
    expect(useFlowStore.getState().animationPathDraft).toMatchObject({
      preset: "cascade",
      nodeIds: ["root", "a", "b", "c"],
      edgeIds: ["root-a", "root-b", "a-c"],
    });

    useFlowStore.getState().editAnimationPath(scenarios[1].id);
    expect(useFlowStore.getState().animationPathDraft).toMatchObject({
      preset: "loop",
      nodeIds: ["root", "a", "c", "root"],
    });
  });

  test("saves and reloads custom path appearance", () => {
    useFlowStore.setState({
      nodes: [node("user"), node("server")],
      edges: [edge("user-server", "user", "server")],
    });

    useFlowStore.getState().beginAnimationPath("user");
    useFlowStore.getState().setAnimationPathAppearance({
      colors: ["#22d3ee", "#2563eb"],
      widthPx: 7,
      beamLengthPx: 72,
      opacity: 0.65,
      glowBlurPx: 8,
    });
    useFlowStore.getState().appendAnimationPathNode("server");
    useFlowStore.getState().animateDraftPath();

    const scenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    const edgeClip = scenario.tracks.find(
      (track) => track.property === "connection-effect"
    )?.clips[0];
    expect(edgeClip?.effect.params).toMatchObject({
      colors: ["#22d3ee", "#2563eb"],
      widthPx: 7,
      beamLengthPx: 72,
      opacity: 0.65,
      glowBlurPx: 8,
    });
    expect(
      scenario.tracks
        .filter((track) => track.property === "node-effect")
        .map((track) => track.clips[0].effect.params.colors)
    ).toEqual([
      ["#22d3ee", "#2563eb"],
      ["#22d3ee", "#2563eb"],
    ]);

    useFlowStore.getState().editAnimationPath(scenario.id);
    expect(useFlowStore.getState().animationPathDraft?.appearance).toEqual({
      colors: ["#22d3ee", "#2563eb"],
      responseColors: ["#38bdf8", "#818cf8"],
      widthPx: 7,
      beamLengthPx: 72,
      opacity: 0.65,
      glowBlurPx: 8,
      shimmer: true,
    });
  });

  test("can save a custom path without block shimmer", () => {
    useFlowStore.setState({
      nodes: [node("user"), node("server")],
      edges: [edge("user-server", "user", "server")],
    });

    useFlowStore.getState().beginAnimationPath("user");
    useFlowStore.getState().setAnimationPathAppearance({ shimmer: false });
    useFlowStore.getState().appendAnimationPathNode("server");
    useFlowStore.getState().animateDraftPath();

    const scenario = useFlowStore.getState().scenarioDocument.scenarios[0];
    const edgeClip = scenario.tracks.find(
      (track) => track.property === "connection-effect"
    )?.clips[0];
    expect(
      scenario.tracks.filter((track) => track.property === "node-effect")
    ).toEqual([]);
    expect(edgeClip?.startMs).toBe(0);
    expect(scenario.durationMs).toBe(1_500);

    useFlowStore.getState().editAnimationPath(scenario.id);
    expect(useFlowStore.getState().animationPathDraft?.appearance.shimmer).toBe(
      false
    );
  });

  test("saves multiple named custom paths without replacing earlier paths", () => {
    useFlowStore.setState({
      nodes: [node("user"), node("firewall"), node("proxy"), node("server")],
      edges: [
        edge("user-firewall", "user", "firewall"),
        edge("proxy-server", "proxy", "server"),
      ],
    });

    useFlowStore.getState().beginAnimationPath("user");
    useFlowStore.getState().setAnimationPathName("Login");
    useFlowStore.getState().appendAnimationPathNode("firewall");
    useFlowStore.getState().animateDraftPath();
    const firstScenarioId = useFlowStore.getState().scenarioDocument.defaultScenarioId;

    useFlowStore.getState().beginAnimationPath("proxy");
    useFlowStore.getState().setAnimationPathName("Checkout");
    useFlowStore.getState().appendAnimationPathNode("server");
    useFlowStore.getState().animateDraftPath();

    const document = useFlowStore.getState().scenarioDocument;
    expect(document.scenarios.map((scenario) => scenario.name)).toEqual([
      "Login",
      "Checkout",
    ]);
    expect(document.scenarios.map((scenario) =>
      scenario.tracks
        .filter((track) => track.property === "connection-effect")
        .map((track) => "id" in track.target ? track.target.id : null)
    )).toEqual([["user-firewall"], ["proxy-server"]]);
    expect(document.defaultScenarioId).not.toBe(firstScenarioId);

    useFlowStore.getState().editAnimationPath(firstScenarioId ?? undefined);
    useFlowStore.getState().setAnimationPathName("Authentication");
    useFlowStore.getState().animateDraftPath();

    const edited = useFlowStore.getState().scenarioDocument;
    expect(edited.scenarios.map((scenario) => scenario.name)).toEqual([
      "Authentication",
      "Checkout",
    ]);
    expect(edited.scenarios[1].tracks
      .filter((track) => track.property === "connection-effect")
      .map((track) => "id" in track.target ? track.target.id : null)
    ).toEqual(["proxy-server"]);
  });

  test("deletes a custom path and activates the remaining path", () => {
    useFlowStore.setState({
      nodes: [node("user"), node("firewall"), node("proxy"), node("server")],
      edges: [
        edge("user-firewall", "user", "firewall"),
        edge("proxy-server", "proxy", "server"),
      ],
    });

    useFlowStore.getState().beginAnimationPath("user");
    useFlowStore.getState().setAnimationPathName("Login");
    useFlowStore.getState().appendAnimationPathNode("firewall");
    useFlowStore.getState().animateDraftPath();
    const loginId = useFlowStore.getState().scenarioDocument.defaultScenarioId;

    useFlowStore.getState().beginAnimationPath("proxy");
    useFlowStore.getState().setAnimationPathName("Checkout");
    useFlowStore.getState().appendAnimationPathNode("server");
    useFlowStore.getState().animateDraftPath();
    const checkoutId =
      useFlowStore.getState().scenarioDocument.defaultScenarioId;
    useFlowStore.getState().editAnimationPath(checkoutId ?? undefined);

    useFlowStore.getState().deleteAnimationPath(checkoutId!);

    expect(useFlowStore.getState().scenarioDocument).toMatchObject({
      defaultScenarioId: loginId,
      scenarios: [{ id: loginId, name: "Login" }],
    });
    expect(useFlowStore.getState().animationPathDraft).toBeNull();
  });

  test("activates the saved path that contains a selected edge", () => {
    useFlowStore.setState({
      nodes: [node("user"), node("firewall"), node("proxy"), node("server")],
      edges: [
        edge("user-firewall", "user", "firewall"),
        edge("proxy-server", "proxy", "server"),
      ],
    });

    useFlowStore.getState().beginAnimationPath("user");
    useFlowStore.getState().setAnimationPathName("Login");
    useFlowStore.getState().appendAnimationPathNode("firewall");
    useFlowStore.getState().animateDraftPath();
    const loginScenarioId =
      useFlowStore.getState().scenarioDocument.defaultScenarioId;

    useFlowStore.getState().beginAnimationPath("proxy");
    useFlowStore.getState().setAnimationPathName("Checkout");
    useFlowStore.getState().appendAnimationPathNode("server");
    useFlowStore.getState().animateDraftPath();
    const checkoutScenarioId =
      useFlowStore.getState().scenarioDocument.defaultScenarioId;

    useFlowStore.setState((state) => ({
      scenarioDocument: {
        ...state.scenarioDocument,
        defaultScenarioId: loginScenarioId,
      },
    }));
    useFlowStore.getState().onEdgesChange([
      { type: "select", id: "proxy-server", selected: true },
    ]);

    expect(useFlowStore.getState().scenarioDocument.defaultScenarioId).toBe(
      checkoutScenarioId
    );
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

  test("upgrades an existing load balancer template to balanced preview", () => {
    useFlowStore.getState().insertTemplate("load-balanced-web-app", {
      x: 0,
      y: 0,
    });
    const current = useFlowStore.getState();
    const legacyScenarios = current.scenarioDocument.scenarios.filter(
      (scenario) => scenario.name !== "Load-balanced requests"
    );
    const legacyDocument = {
      ...current.scenarioDocument,
      scenarios: legacyScenarios,
      defaultScenarioId: legacyScenarios[0]?.id ?? null,
    };
    const merge = useFlowStore.persist.getOptions().merge;
    if (!merge) throw new Error("Expected persisted-state merge");

    const hydrated = merge(
      { scenarioDocument: legacyDocument },
      current
    ) as typeof current;
    const active = hydrated.scenarioDocument.scenarios.find(
      (scenario) => scenario.id === hydrated.scenarioDocument.defaultScenarioId
    );

    expect(active?.name).toBe("Load-balanced requests");
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
