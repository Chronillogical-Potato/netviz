import { beforeEach, describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import {
  useFlowStore,
  type LineNode,
} from "../src/store/flow-store";

beforeEach(() => {
  useFlowStore.setState({ nodes: [], edges: [], groups: [] });
});

describe("line endpoint bindings", () => {
  test("keeps a connected line attached while its block moves", () => {
    const state = useFlowStore.getState();
    const first = state.addShapeNode(
      "rectangle",
      { x: 0, y: 0 },
      { width: 100, height: 60 }
    );
    const second = state.addShapeNode(
      "rectangle",
      { x: 300, y: 0 },
      { width: 100, height: 60 }
    );
    const lineId = state.addLineNode({ x: 100, y: 30 }, { x: 300, y: 30 });
    const bind = (
      useFlowStore.getState() as unknown as {
        setLineEndpointBinding?: (
          lineId: string,
          endpoint: "start" | "end",
          binding: { nodeId: string; handleId: string } | null
        ) => void;
      }
    ).setLineEndpointBinding;

    expect(bind).toEqual(expect.any(Function));
    if (!bind) return;
    bind(lineId, "start", { nodeId: first, handleId: "right" });
    bind(lineId, "end", { nodeId: second, handleId: "left" });

    let line = useFlowStore
      .getState()
      .nodes.find((node): node is LineNode => node.id === lineId);
    expect(line?.position).toEqual({ x: 88, y: 18 });
    expect(line?.data.start).toEqual({ x: 12, y: 12 });
    expect(line?.data.end).toEqual({ x: 212, y: 12 });

    useFlowStore.getState().onNodesChange([
      {
        id: first,
        type: "position",
        position: { x: 50, y: 20 },
        dragging: false,
      },
    ]);

    line = useFlowStore
      .getState()
      .nodes.find((node): node is LineNode => node.id === lineId);
    expect(line?.position).toEqual({ x: 138, y: 18 });
    expect(line?.data.start).toEqual({ x: 12, y: 32 });
    expect(line?.data.end).toEqual({ x: 162, y: 12 });

    useFlowStore.getState().updateNodeData(first, { rotation: 90 });

    line = useFlowStore
      .getState()
      .nodes.find((node): node is LineNode => node.id === lineId);
    expect(line?.position).toEqual({ x: 88, y: 18 });
    expect(line?.data.start).toEqual({ x: 12, y: 82 });
    expect(line?.data.end).toEqual({ x: 212, y: 12 });
  });

  test("uses block handles when drawing and reconnecting line endpoints", async () => {
    const canvas = await testFile(
      new URL("../src/components/canvas.tsx", import.meta.url)
    ).text();
    const lineNode = await testFile(
      new URL("../src/components/nodes/line-node.tsx", import.meta.url)
    ).text();

    expect(canvas).toContain("findLineBindingAtPoint");
    expect(lineNode).toContain("findLineBindingAtPoint");
  });
});
