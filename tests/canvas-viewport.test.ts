import { afterEach, describe, expect, test } from "vitest";
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

  test("round-trips zoom and position through persisted state", () => {
    const viewport = { x: -360, y: 128, zoom: 1.4 };
    useFlowStore.getState().setCanvasViewport(viewport);
    const partialize = useFlowStore.persist.getOptions().partialize;
    const merge = useFlowStore.persist.getOptions().merge;
    if (!partialize || !merge) throw new Error("Expected persistence options");

    const persisted = partialize(useFlowStore.getState());
    const hydrated = merge(
      persisted,
      { ...useFlowStore.getState(), canvasViewport: null }
    ) as ReturnType<typeof useFlowStore.getState>;

    expect(persisted).toMatchObject({ canvasViewport: viewport });
    expect(hydrated.canvasViewport).toEqual(viewport);
  });
});
