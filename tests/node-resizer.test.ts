import { describe, expect, test } from "bun:test";

const nodeFiles = [
  "infra-node",
  "shape-node",
  "text-node",
  "step-node",
  "image-node",
  "code-node",
];

describe("canvas node resize selector", () => {
  test("uses a zoom-aware shared resizer on every resizable node", async () => {
    for (const file of nodeFiles) {
      const source = await Bun.file(
        new URL(`../src/components/nodes/${file}.tsx`, import.meta.url)
      ).text();
      expect(source).toContain("CanvasNodeResizer");
      expect(source).toContain("!h-1.5 !w-1.5");
    }

    const css = await Bun.file(
      new URL("../src/index.css", import.meta.url)
    ).text();
    expect(css).toContain("--nv-resize-line-width");
    expect(css).toContain("width: 7px");
    expect(css).toContain("height: 7px");

    const resizer = await Bun.file(
      new URL(
        "../src/components/nodes/canvas-node-resizer.tsx",
        import.meta.url
      )
    ).text();
    expect(resizer).toContain('event.key === "Shift"');
    expect(resizer).toContain("keepAspectRatio || shiftDown");
  });
});
