import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import * as NodeControls from "../src/components/nodes/canvas-node-resizer";

describe("node corner rotation", () => {
  test("accumulates rotation smoothly across the angle boundary", () => {
    const advance = (
      NodeControls as unknown as {
        rotationAfterPointerMove?: (
          rotation: number,
          previousPointerAngle: number,
          pointerAngle: number,
          snap: boolean
        ) => number;
      }
    ).rotationAfterPointerMove;

    expect(typeof advance).toBe("function");
    if (!advance) return;
    expect(advance(350, 170, -170, false)).toBe(10);
    expect(advance(7, 0, 3, true)).toBe(15);
  });

  test("adds corner rotation controls to shapes and text", async () => {
    for (const file of ["shape-node", "text-node"]) {
      const source = await testFile(
        new URL(`../src/components/nodes/${file}.tsx`, import.meta.url)
      ).text();
      expect(source).toContain("NodeRotationControls");
      expect(source).toContain("data.rotation");
    }
  });

  test("uses invisible Figma-style rotation zones at every corner", async () => {
    const source = await testFile(
      new URL(
        "../src/components/nodes/canvas-node-resizer.tsx",
        import.meta.url
      )
    ).text();

    expect(source).toContain("nv-rotation-zone");
    expect(source).toContain("h-5 w-5");
    expect(source).not.toContain("showCornerHandles");
  });
});
