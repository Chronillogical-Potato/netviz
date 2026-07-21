import { beforeEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { CanvasToolbar } from "../src/components/canvas-toolbar";
import { useFlowStore, type LineNode } from "../src/store/flow-store";

beforeEach(() => {
  useFlowStore.setState({ nodes: [], edges: [], groups: [] });
});

describe("line tool", () => {
  test("appears in the canvas toolbar with the L shortcut", () => {
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <CanvasToolbar tool="select" onToolChange={() => {}} />
      </ReactFlowProvider>
    );

    expect(markup).toContain('aria-label="Line (L)"');
  });

  test("creates the line from its anchored points with an end arrow", () => {
    const addLineNode = useFlowStore.getState().addLineNode as unknown as (
      start: { x: number; y: number },
      end: { x: number; y: number }
    ) => string;
    const id = addLineNode({ x: 100, y: 100 }, { x: 260, y: 160 });
    const line = useFlowStore
      .getState()
      .nodes.find((node): node is LineNode => node.id === id);

    expect(line?.position).toEqual({ x: 88, y: 88 });
    expect(line?.style).toMatchObject({ width: 184, height: 84 });
    expect(line?.data.start).toEqual({ x: 12, y: 12 });
    expect(line?.data.end).toEqual({ x: 172, y: 72 });
    expect(line?.data.arrowStart).toBe(false);
    expect(line?.data.arrowEnd).toBe(true);
  });

  test("does not offer the removed bar arrow", async () => {
    const inspector = await Bun.file(
      new URL("../src/components/inspector.tsx", import.meta.url)
    ).text();
    const lineNode = await Bun.file(
      new URL("../src/components/nodes/line-node.tsx", import.meta.url)
    ).text();

    expect(inspector).not.toContain('label: "Bar"');
    expect(lineNode).not.toContain('case "bar"');
  });
});
