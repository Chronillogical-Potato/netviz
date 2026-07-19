import { beforeEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasOptions } from "../src/components/canvas-options";
import { useFlowStore, type LabeledEdge } from "../src/store/flow-store";

beforeEach(() => {
  useFlowStore.setState({
    turbo: false,
    edgeCurveStyle: "stepped",
    edges: [
      {
        id: "edge-a",
        type: "labeled",
        source: "a",
        target: "b",
        selected: true,
        data: { curveStyle: "smooth", lineStyle: "solid" },
      } as LabeledEdge,
    ],
  });
});

describe("CanvasOptions", () => {
  test("offers two visual edge curve modes", () => {
    const markup = renderToStaticMarkup(<CanvasOptions />);

    expect(markup).toContain("Curve");
    expect(markup).toContain("Stepped");
    expect(markup).toContain("Smooth");
    expect(markup).toContain('aria-label="Smooth edge curve"');
    expect(markup).toContain('aria-pressed="true"');
  });
});
