import { describe, expect, test } from "bun:test";
import {
  createFlowSnapshot,
  parseFlowSnapshot,
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
