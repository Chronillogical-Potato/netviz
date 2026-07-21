import { describe, expect, test } from "bun:test";

describe("inspector layout", () => {
  test("scrolls the complete animation inspector when paths overflow", async () => {
    const source = await Bun.file(
      new URL("../src/components/inspector.tsx", import.meta.url)
    ).text();
    const animationBranch = source.slice(
      source.indexOf('if (workMode === "animation"'),
      source.indexOf("\n  return (", source.indexOf('if (workMode === "animation"') + 1)
    );

    expect(animationBranch).toContain("min-h-0 flex-1 overflow-y-auto");
  });
});
