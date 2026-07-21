import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { Toolbar } from "../src/components/toolbar";

describe("project sharing UI", () => {
  test("offers project sharing beside the preview control", () => {
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <Toolbar />
      </ReactFlowProvider>
    );

    expect(markup).toContain('aria-label="Share project"');
    expect(markup.indexOf("Share project")).toBeLessThan(
      markup.indexOf("Preview")
    );
  });
});
