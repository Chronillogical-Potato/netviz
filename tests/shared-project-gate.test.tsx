import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SharedProjectConflictContent } from "../src/App";

describe("shared project protection", () => {
  test("warns before replacing a workspace and offers a direct download", () => {
    const markup = renderToStaticMarkup(
      <SharedProjectConflictContent
        projectName="Production request flow"
        onDownload={() => {}}
        onCancel={() => {}}
        onOpen={() => {}}
      />
    );

    expect(markup).toContain("Open shared project?");
    expect(markup).toContain("Production request flow");
    expect(markup).toContain("replace your current local workspace");
    expect(markup).toContain("incognito/private window");
    expect(markup).toContain("Download current project");
    expect(markup).toContain("Cancel");
    expect(markup).toContain("Open project");
    expect(markup).toContain("grid-cols-3");
    expect(markup).not.toContain("underline");
    expect(markup.indexOf("Cancel")).toBeLessThan(
      markup.indexOf("Download current project")
    );
    expect(markup.indexOf("Download current project")).toBeLessThan(
      markup.indexOf("Open project")
    );
  });
});
