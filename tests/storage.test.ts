import { describe, expect, test } from "vitest";
import {
  createFlowSnapshot,
  createShareUrl,
  hasWorkspaceContent,
  parseFlowSnapshot,
  parseSharedProject,
  urlWithoutSharePayload,
} from "../src/lib/storage";

const minimalV1 = {
  version: 1,
  projectName: "Old project",
  nodes: [],
  edges: [],
  customBlocks: [],
};

describe("project snapshot parsing", () => {
  test("normalizes version 1 JSON into version 2", () => {
    const parsed = parseFlowSnapshot(JSON.stringify(minimalV1));
    expect(parsed.version).toBe(2);
    expect(parsed.projectName).toBe("Old project");
    expect(parsed.scenarioDocument).toEqual({
      schemaVersion: 1,
      scenarios: [],
      defaultScenarioId: null,
    });
  });

  test("accepts a version 2 object", () => {
    const parsed = parseFlowSnapshot(minimalV1);
    expect(parseFlowSnapshot(parsed)).toEqual(parsed);
  });

  test("rejects unsupported versions and invalid collection shapes", () => {
    expect(() =>
      parseFlowSnapshot({ ...minimalV1, version: 99 })
    ).toThrow("Unsupported file version");
    expect(() =>
      parseFlowSnapshot({ ...minimalV1, nodes: "not-an-array" })
    ).toThrow("Invalid snapshot shape");
  });

  test("does not serialize ephemeral transport fields", () => {
    const parsed = parseFlowSnapshot({
      ...minimalV1,
      currentTimeMs: 420,
      transportStatus: "playing",
    });
    expect("currentTimeMs" in parsed).toBe(false);
    expect("transportStatus" in parsed).toBe(false);
  });

  test("does not export legacy CSS animation flags", () => {
    const parsed = parseFlowSnapshot(minimalV1);
    const { version: _version, ...source } = parsed;
    const edge = {
      id: "edge-a",
      type: "labeled" as const,
      source: "a",
      target: "b",
      animated: true,
      data: { lineStyle: "solid" as const },
    };
    const snapshot = createFlowSnapshot({
      ...source,
      edges: [edge],
      pageContents: {
        "page-2": {
          nodes: [],
          edges: [{ ...edge, id: "edge-b" }],
          groups: [],
          scenarioDocument: {
            schemaVersion: 1,
            scenarios: [],
            defaultScenarioId: null,
          },
        },
      },
    });

    expect(snapshot.edges[0].animated).toBe(false);
    expect(snapshot.pageContents["page-2"].edges[0].animated).toBe(false);
  });
});

describe("project share links", () => {
  test("round-trips a compressed project through a URL-safe fragment", async () => {
    const snapshot = parseFlowSnapshot({
      ...minimalV1,
      projectName: "Shared request flow",
    });
    const link = await createShareUrl(
      snapshot,
      "https://netviz.test/editor?theme=dark"
    );
    const url = new URL(link);
    const payload = new URLSearchParams(url.hash.slice(1)).get("share");

    expect(url.origin + url.pathname + url.search).toBe(
      "https://netviz.test/editor?theme=dark"
    );
    expect(payload).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(await parseSharedProject(url.hash)).toEqual(snapshot);
  });

  test("rejects a damaged shared-project payload", async () => {
    await expect(
      parseSharedProject("#share=v1.not-valid-compressed-data")
    ).rejects.toThrow("Could not read shared project");
  });

  test("removes the shared payload while preserving the rest of the URL", () => {
    expect(
      urlWithoutSharePayload(
        "https://netviz.test/editor?theme=dark#panel=layers&share=v1.payload"
      )
    ).toBe("/editor?theme=dark#panel=layers");
    expect(
      urlWithoutSharePayload(
        "https://netviz.test/editor?theme=dark#share=v1.payload"
      )
    ).toBe("/editor?theme=dark");
  });

  test("distinguishes a new workspace from meaningful local work", () => {
    const empty = parseFlowSnapshot({ ...minimalV1, projectName: "Untitled" });
    expect(hasWorkspaceContent(empty)).toBe(false);
    expect(hasWorkspaceContent({ ...empty, projectName: "My draft" })).toBe(
      true
    );
    expect(
      hasWorkspaceContent({
        ...empty,
        nodes: [{ id: "node-a" }] as typeof empty.nodes,
      })
    ).toBe(true);
    expect(
      hasWorkspaceContent({
        ...empty,
        pages: [{ ...empty.pages[0], bgColor: "#101010" }],
      })
    ).toBe(true);
  });
});
