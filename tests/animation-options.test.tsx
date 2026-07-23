import { beforeEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createEmptyScenarioDocument } from "../src/animation/scenario-document";
import * as AnimationOptionComponents from "../src/components/animation-options";
import {
  AnimationOverview,
  AnimationOptions,
  AnimationPathBuilder,
  AnimationPathDragHandle,
  RequestFlowOptions,
  createAnimationColorPatch,
  createAnimationWidthPatch,
  summarizeAnimationSelection,
} from "../src/components/animation-options";
import { projectEdgeEffect } from "../src/animation/edge-effects";
import { evaluateClipTiming } from "../src/animation/timing";
import { Dialog } from "../src/ui/dialog";
import {
  useFlowStore,
  type LabeledEdge,
} from "../src/store/flow-store";

const edge = (id: string): LabeledEdge => ({
  id,
  type: "labeled",
  source: `${id}-source`,
  target: `${id}-target`,
  selected: true,
  animated: false,
  data: { lineStyle: "solid" },
});

beforeEach(() => {
  const temporal = useFlowStore.temporal.getState();
  temporal.pause();
  useFlowStore.setState({
    edges: [edge("edge-a")],
    scenarioDocument: createEmptyScenarioDocument(),
    workMode: "animation",
    motionPreference: "full",
  });
  temporal.clear();
  temporal.resume();
});

describe("AnimationOptions", () => {
  test("offers all-connections and request-chain authoring states", () => {
    const overview = renderToStaticMarkup(<AnimationOverview />);
    expect(overview).toContain("Animate all connections");
    expect(overview).toContain("text-[13px] font-semibold");
    expect(overview).toContain(
      "text-xs font-medium leading-[18px] text-foreground/70"
    );
    expect(renderToStaticMarkup(<AnimationOverview />)).toContain(
      "Build custom path"
    );
    const flow = renderToStaticMarkup(
      <RequestFlowOptions nodeId="user" nodeLabel="User" />
    );
    expect(flow).toContain("Create request flow");
    expect(flow).toContain("Build custom path");
    expect(flow).toContain("User");
  });

  test("renders a dedicated click-in-order path builder", () => {
    const markup = renderToStaticMarkup(<AnimationPathBuilder />);
    expect(markup).toContain("Click connected blocks in order");
    expect(markup).toContain("Click the first block on the canvas");
    expect(markup).toContain("Path name");
    expect(markup).toContain('aria-label="Path name"');
    expect(markup).toContain("Path preset");
    expect(markup).toContain("Single line");
    expect(markup).toContain('aria-label="Path preset"');
    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).not.toContain("<select");
    expect(markup).toContain("Appearance");
    expect(markup).toContain('aria-label="Path start color"');
    expect(markup).toContain('aria-label="Path end color"');
    expect(markup).toContain('aria-label="Path animation width"');
    expect(markup).toContain('aria-label="Path beam length"');
    expect(markup).toContain('aria-label="Path animation opacity"');
    expect(markup).toContain('aria-label="Path animation glow"');
    expect(markup).toContain('aria-label="Block shimmer"');
    expect(markup).toContain("Save &amp; play");
    expect(markup).toContain("Undo last");
  });

  test("provides a dedicated multiple-output timing control", () => {
    const simultaneous = renderToStaticMarkup(
      <AnimationOptionComponents.OutputTimingControls
        staggerMs={0}
        onChange={() => {}}
      />
    );
    expect(simultaneous).toContain('aria-label="Output timing"');
    expect(simultaneous).toContain('aria-haspopup="listbox"');
    expect(simultaneous).toContain("Simultaneous");
    expect(simultaneous).not.toContain('aria-label="Path stagger delay"');

    const staggered = renderToStaticMarkup(
      <AnimationOptionComponents.OutputTimingControls
        staggerMs={400}
        onChange={() => {}}
      />
    );
    expect(staggered).toContain("Staggered");
    expect(staggered).toContain('aria-label="Path stagger delay"');
    expect(staggered).toContain('aria-label="Path stagger delay slider"');
  });

  test("renders custom paths as draggable animation cards", () => {
    const markup = renderToStaticMarkup(
      <AnimationPathDragHandle name="Login flow" />
    );
    expect(markup).toContain('aria-label="Drag Login flow to reorder"');
    expect(markup).toContain("Drag to reorder");
  });

  test("provides custom path delete confirmation content", () => {
    const markup = renderToStaticMarkup(
      <Dialog open>
        <AnimationOptionComponents.AnimationPathDeleteConfirmation
          name="Login flow"
          onCancel={() => {}}
          onConfirm={() => {}}
        />
      </Dialog>
    );
    expect(markup).toContain("Delete animation?");
    expect(markup).toContain("Login flow");
    expect(markup).toContain("cannot be undone");
    expect(markup).toContain("Cancel");
    expect(markup).toContain("Delete animation");
  });

  test("offers only the gradient beam on an unanimated edge", () => {
    const markup = renderToStaticMarkup(<AnimationOptions />);

    expect(markup).toContain("Add gradient beam");
    expect(markup).not.toContain('aria-label="Animation preset"');
    expect(markup).not.toContain("Moving dash");
    expect(markup).not.toContain("Packet");
    expect(markup).not.toContain("Pulse");
    expect(markup).not.toContain("Particle stream");
    expect(markup).not.toContain("<select");
    expect(markup).toContain("h-7");
    expect(markup).not.toContain("Preview selection");
    expect(markup).toContain("Build custom path");
    expect(markup).not.toContain("Create selected path");
    expect(markup).toContain("Advanced");
    expect(markup).toContain('aria-label="Animation beam length"');
    expect(markup).not.toContain("<details");
  });

  test("uses a short repeating travel-time model for gradient beams", () => {
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.gradient-beam",
      params: { direction: "forward" },
    }, { durationMs: 2_000, easing: "linear" });

    const markup = renderToStaticMarkup(<AnimationOptions />);
    expect(markup).toContain('aria-label="Beam travel time"');
    expect(markup).toContain('aria-label="Beam start delay"');
    expect(markup).toContain("Travel time");
    expect(markup).toContain("Start delay");
  });

  test("offers animation and beam scopes for a template edge occurrence", () => {
    useFlowStore.setState({
      nodes: [],
      edges: [],
      scenarioDocument: createEmptyScenarioDocument(),
    });
    useFlowStore
      .getState()
      .insertTemplate("sharded-postgres-platform", { x: 0, y: 0 });
    const state = useFlowStore.getState();
    const firewall = state.nodes.find(
      (item) => item.data.label === "Edge Firewall"
    );
    const loadBalancer = state.nodes.find(
      (item) => item.data.label === "Traffic Load Balancer"
    );
    expect(firewall).toBeDefined();
    expect(loadBalancer).toBeDefined();
    useFlowStore.setState((current) => ({
      edges: current.edges.map((item) => ({
        ...item,
        selected:
          item.source === firewall?.id && item.target === loadBalancer?.id,
      })),
    }));
    const selected = useFlowStore
      .getState()
      .edges.filter((item) => item.selected);
    expect(selected).toHaveLength(1);
    const occurrences =
      AnimationOptionComponents.findAnimationBeamOccurrences(
        useFlowStore.getState().scenarioDocument,
        selected.map((item) => item.id)
      );
    expect(occurrences.length).toBeGreaterThan(1);
    expect(occurrences.map((item) => item.scenarioName)).toContain(
      "Web profile request / response"
    );
    expect(
      occurrences.some(
        (item) => item.clip.effect.params.pathPhase === "response"
      )
    ).toBeTrue();
    const first = occurrences[0]!;
    const markup = renderToStaticMarkup(
      <AnimationOptionComponents.AnimationBeamScopeControls
        animationOptions={[
          {
            value: first.scenarioId,
            label: first.scenarioName,
          },
        ]}
        activeScenarioId={first.scenarioId}
        beamOptions={[
          {
            value: first.clipId,
            label: "Request · Edge Firewall → Traffic Load Balancer",
          },
        ]}
        activeBeamKey={first.clipId}
        onAnimationChange={() => {}}
        onBeamChange={() => {}}
      />
    );

    expect(markup).toContain('aria-label="Animation occurrence"');
    expect(markup).toContain('aria-label="Beam occurrence"');
    expect(markup).toContain("Web profile request / response");
    expect(markup).toContain("Request");
    expect(markup).toContain("Editing this beam only");
  });

  test("shows mixed state when selected edges do not share an effect", () => {
    useFlowStore.setState({ edges: [edge("edge-a"), edge("edge-b")] });
    useFlowStore.setState((state) => ({
      edges: state.edges.map((item) => ({
        ...item,
        selected: item.id === "edge-a",
      })),
    }));
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.packet",
      params: { direction: "forward" },
    });
    useFlowStore.setState((state) => ({
      edges: state.edges.map((item) => ({ ...item, selected: true })),
    }));

    const summary = summarizeAnimationSelection(
      useFlowStore.getState().scenarioDocument,
      ["edge-a", "edge-b"]
    );
    expect(summary.preset).toEqual({ status: "mixed" });
  });

  test("projects an authored Gradient beam color through the rendered effect", () => {
    useFlowStore.getState().applySelectedEdgeEffect({
      type: "edge.gradient-beam",
      params: {
        colors: ["#38bdf8", "#818cf8"],
        direction: "forward",
      },
    });
    useFlowStore
      .getState()
      .patchSelectedEdgeEffects(createAnimationColorPatch("#f97316"));

    const clip = useFlowStore.getState().scenarioDocument.scenarios[0].tracks[0]
      .clips[0];
    const projection = projectEdgeEffect(
      clip,
      evaluateClipTiming(clip, clip.startMs + clip.durationMs / 2)
    );

    expect(projection.supported && projection.colors[0]).toBe("#f97316");
    expect(projection.supported && projection.colors[1]).toBe("#818cf8");
  });

  test("maps the shared Width control to Packet and Particle stream geometry", () => {
    for (const effect of [
      {
        type: "edge.packet",
        params: { widthPx: 3, sizePx: 6, direction: "forward" },
        projectionField: "sizePx",
      },
      {
        type: "edge.particle-stream",
        params: {
          widthPx: 2,
          particleSizePx: 3,
          particleCount: 8,
          direction: "forward",
        },
        projectionField: "particleSizePx",
      },
    ] as const) {
      useFlowStore.getState().removeSelectedEdgeEffects();
      useFlowStore.getState().applySelectedEdgeEffect(effect);
      useFlowStore
        .getState()
        .patchSelectedEdgeEffects(createAnimationWidthPatch(99));

      const document = useFlowStore.getState().scenarioDocument;
      const summary = summarizeAnimationSelection(document, ["edge-a"]);
      const clip = document.scenarios[0].tracks[0].clips[0];
      const projection = projectEdgeEffect(
        clip,
        evaluateClipTiming(clip, clip.startMs + clip.durationMs / 2)
      );

      expect(summary.width).toEqual({ status: "uniform", value: 24 });
      expect(projection.supported && projection[effect.projectionField]).toBe(
        24
      );
    }
  });
});
