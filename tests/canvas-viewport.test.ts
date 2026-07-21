import { afterEach, describe, expect, test } from "bun:test";
import { useFlowStore } from "../src/store/flow-store";

describe("canvas viewport persistence", () => {
  const initialViewport = useFlowStore.getState().canvasViewport;

  afterEach(() => {
    useFlowStore.setState({ canvasViewport: initialViewport });
  });

  test("stores the editor viewport independently from presentation camera state", () => {
    const viewport = { x: -240, y: 96, zoom: 1.25 };

    useFlowStore.getState().setCanvasViewport(viewport);

    expect(useFlowStore.getState().canvasViewport).toEqual(viewport);
  });
});
