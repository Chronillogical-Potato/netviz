import { describe, expect, test } from "bun:test";

describe("infra circle display", () => {
  test("keeps square as the default and offers a circle option", async () => {
    const inspector = await Bun.file(
      new URL("../src/components/inspector.tsx", import.meta.url)
    ).text();
    const editor = inspector.slice(
      inspector.indexOf("function InfraEditor"),
      inspector.indexOf("const BORDER_STYLES")
    );

    expect(editor).toContain('node.data.shape ?? "square"');
    expect(editor).toContain('{ value: "circle", label: "Circle" }');
  });

  test("renders the icon in a circle with text outside", async () => {
    const node = await Bun.file(
      new URL("../src/components/nodes/infra-node.tsx", import.meta.url)
    ).text();

    expect(node).toContain('data.shape === "circle"');
    expect(node).toContain("h-24 w-24 rounded-full");
    expect(node).toContain("{iconTile}");
    expect(node).toContain("{textBlock}");
  });
});
