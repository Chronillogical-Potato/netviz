import { describe, expect, test } from "bun:test";

const nodeFiles = ["infra-node", "shape-node", "image-node", "step-node"];

describe("canvas node resize selector", () => {
  test("uses a zoom-aware shared resizer on every resizable node", async () => {
    for (const file of nodeFiles) {
      const source = await Bun.file(
        new URL(`../src/components/nodes/${file}.tsx`, import.meta.url)
      ).text();
      expect(source).toContain("CanvasNodeResizer");
      expect(source).toContain("!h-2 !w-2");
    }

    const css = await Bun.file(
      new URL("../src/index.css", import.meta.url)
    ).text();
    expect(css).toContain("--nv-resize-line-width");
  });
});
