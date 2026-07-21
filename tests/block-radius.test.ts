import { describe, expect, test } from "bun:test";

describe("block border radius", () => {
  test("applies border radius to every block-like node", async () => {
    for (const file of [
      "infra-node",
      "shape-node",
      "text-node",
      "step-node",
      "image-node",
      "code-node",
    ]) {
      const source = await Bun.file(
        new URL(`../src/components/nodes/${file}.tsx`, import.meta.url)
      ).text();
      expect(source).toContain("borderRadius");
    }
  });

  test("offers radius control for step blocks", async () => {
    const inspector = await Bun.file(
      new URL("../src/components/inspector.tsx", import.meta.url)
    ).text();
    const stepEditor = inspector.slice(
      inspector.indexOf("function StepEditor"),
      inspector.indexOf("function TextEditor")
    );

    expect(stepEditor).toContain('label="Radius"');
  });
});
