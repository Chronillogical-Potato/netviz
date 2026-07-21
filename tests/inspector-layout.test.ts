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

  test("offers persistent Video delay and camera controls", async () => {
    const source = await Bun.file(
      new URL("../src/components/inspector.tsx", import.meta.url)
    ).text();
    expect(source).toContain("<VideoSettings />");
    expect(source).toContain('placeholder="Current animation name"');
    expect(source).toContain('ariaLabel="Start delay"');
    expect(source).toContain('ariaLabel="Between animations delay"');
    expect(source).toContain('ariaLabel="End delay"');
    expect(source).toContain('label="Camera follow"');
    expect(source).toContain("max={10_000}");
    expect(source).toContain("videoTitle");
    expect(source).toContain("videoStartDelayMs");
    expect(source).toContain("videoBetweenDelayMs");
    expect(source).toContain("videoEndDelayMs");
    expect(source).toContain("videoCameraFollowEnabled");
    expect(source).toContain("Keeps your saved zoom and canvas position");
  });
});
