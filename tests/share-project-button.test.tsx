import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { Toolbar } from "../src/components/toolbar";

describe("project sharing UI", () => {
  test("keeps only Preview in the top-right navigation", () => {
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <Toolbar />
      </ReactFlowProvider>
    );

    expect(markup).toContain("Preview");
    expect(markup).not.toContain('aria-label="Share project"');
    expect(markup).not.toContain(">Save<");
    expect(markup).not.toContain(">Export<");
  });

  test("moves sharing into File settings and uses a settings icon", async () => {
    const toolbar = await Bun.file(
      new URL("../src/components/toolbar.tsx", import.meta.url)
    ).text();
    const settings = await Bun.file(
      new URL("../src/components/settings-dialog.tsx", import.meta.url)
    ).text();

    expect(toolbar).toContain("<Settings className=");
    expect(toolbar).not.toContain("<MoreVertical className=");
    expect(settings).toContain('label="Share project"');
    expect(settings).toContain("onClick={run(actions.onShare)}");
    expect(settings).not.toContain("<ShareProjectButton");
    expect(toolbar).toContain("<ShareProjectDialog");
  });
});
