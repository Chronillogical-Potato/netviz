import { beforeEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createEmptyScenarioDocument } from "../src/animation/scenario-document";
import {
  AnimationOptions,
  createAnimationColorPatch,
  createAnimationWidthPatch,
  summarizeAnimationSelection,
} from "../src/components/animation-options";
import { projectEdgeEffect } from "../src/animation/edge-effects";
import { evaluateClipTiming } from "../src/animation/timing";
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
  test("renders the compact Stage 1 authoring surface for an unanimated edge", () => {
    const markup = renderToStaticMarkup(<AnimationOptions />);

    expect(markup).toContain('aria-label="Animation preset"');
    expect(markup).toContain('value="none" selected="">None</option>');
    expect(markup).toContain('aria-label="Animation direction"');
    expect(markup).toContain('aria-label="Animation duration"');
    expect(markup).toContain('aria-label="Animation delay"');
    expect(markup).toContain("Preview selection");
    expect(markup).toContain("Advanced");
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
