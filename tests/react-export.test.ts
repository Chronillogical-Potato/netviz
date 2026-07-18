import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { generateReactComponent } from "../src/lib/react-export";
import type { AppNode, LabeledEdge } from "../src/store/flow-store";

describe("React component export", () => {
  test("creates a dependency-free animated TSX component", () => {
    const nodes = [
      {
        id: "client",
        type: "infra",
        position: { x: 0, y: 0 },
        style: { width: 220, height: 72 },
        data: {
          blockId: "service-provider",
          label: "Client",
          subtitle: "Browser",
          variant: "row",
        },
      },
      {
        id: "server",
        type: "infra",
        position: { x: 360, y: 0 },
        style: { width: 220, height: 72 },
        data: {
          blockId: "server",
          label: "Server",
          subtitle: "Linux host",
          variant: "row",
        },
      },
    ] as AppNode[];
    const edges = [
      {
        id: "client-server",
        type: "labeled",
        source: "client",
        target: "server",
        sourceHandle: "right",
        targetHandle: "left",
        data: { lineStyle: "solid" },
      },
    ] as LabeledEdge[];
    const code = generateReactComponent({
      projectName: "Load balancer diagram",
      nodes,
      edges,
      customBlocks: [],
      pageBackground: "#000000",
      scenarioDocument: {
        schemaVersion: 1,
        defaultScenarioId: "request",
        scenarios: [
          {
            id: "request",
            name: "Request flow",
            durationMs: 2_300,
            playback: {
              rate: 1,
              loop: { mode: "repeat", startMs: 0, endMs: 2_300 },
            },
            tracks: [
              {
                id: "track",
                target: { type: "edge", id: "client-server" },
                property: "connection-effect",
                enabled: true,
                clips: [
                  {
                    id: "clip",
                    startMs: 800,
                    durationMs: 1_500,
                    easing: "linear",
                    repeatCount: 0,
                    repeatDelayMs: 0,
                    effect: {
                      type: "edge.gradient-beam",
                      params: {
                        colors: ["#22d3ee", "#2563eb"],
                        widthPx: 4,
                      },
                    },
                  },
                ],
              },
            ],
            markers: [],
            triggers: [],
          },
        ],
      },
    });

    expect(code).toContain("export function LoadBalancerDiagram");
    expect(code).toContain("Request flow");
    expect(code).toContain("#22d3ee");
    expect(code).toContain("<animate");
    expect(code).not.toContain("@xyflow/react");

    const result = ts.transpileModule(code, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      reportDiagnostics: true,
    });
    expect(result.diagnostics ?? []).toHaveLength(0);
  });
});
