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
  test("uses the inspector layout for edge appearance and labels", () => {
    const markup = renderToStaticMarkup(<CanvasOptions />);

    expect(markup).toContain("Appearance");
    expect(markup).toContain("Label");
    expect(markup).toContain("Curve");
    expect(markup).toContain("Stepped");
    expect(markup).toContain('aria-label="Edge style"');
    expect(markup).toContain('aria-label="Edge curve"');
    expect(markup.match(/aria-haspopup="listbox"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Edge label"');
    expect(markup).toContain('aria-label="Text color"');
    expect(markup).toContain('aria-label="Background color"');
    expect(markup).toContain('aria-label="Border color"');
    expect(markup).not.toContain("Target");
    expect(markup).toContain("grid-cols-[72px_1fr]");
    expect(markup).toContain("border-b border-border px-4 py-3.5");
    expect(markup).not.toContain("Turbo");
  });
});
