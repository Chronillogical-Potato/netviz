import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { BlocksFlyout } from "../src/components/blocks-flyout";

describe("BlocksFlyout", () => {
  test("separates block sections and softens their stronger names", () => {
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <BlocksFlyout onAdded={() => {}} />
      </ReactFlowProvider>
    );

    expect(markup).toContain("gap-3");
    expect(markup).toContain("font-semibold text-foreground/80");
    expect(markup).toContain("text-muted-foreground/90");
    expect(markup).toContain(">Blocks<");
    expect(markup).not.toContain(">Core<");
    expect(markup).toContain('placeholder="Search…"');
    expect(markup).toContain("Image — click to add");
    expect(markup).not.toContain("Line — click to add");
  });
});
