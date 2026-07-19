import { describe, expect, test } from "bun:test";
import * as CanvasComponents from "../src/components/canvas";

describe("canvas tool interactions", () => {
  test("disables element interaction while the hand tool is active", () => {
    const isEnabled = (
      CanvasComponents as unknown as {
        isCanvasElementInteractionEnabled?: (
          tool: string,
          preview: boolean,
          pickingPath: boolean
        ) => boolean;
      }
    ).isCanvasElementInteractionEnabled;

    expect(typeof isEnabled).toBe("function");
    if (!isEnabled) return;
    expect(isEnabled("hand", false, false)).toBe(false);
    expect(isEnabled("select", false, false)).toBe(true);
    expect(isEnabled("select", true, false)).toBe(false);
  });

  test("uses the final pointer position for the created shape bounds", () => {
    const getBounds = (
      CanvasComponents as unknown as {
        getDrawBounds?: (
          start: { x: number; y: number },
          end: { x: number; y: number },
          toFlow: (point: { x: number; y: number }) => {
            x: number;
            y: number;
          }
        ) => {
          position: { x: number; y: number };
          size: { width: number; height: number };
        };
      }
    ).getDrawBounds;

    expect(typeof getBounds).toBe("function");
    if (!getBounds) return;
    expect(
      getBounds({ x: 40, y: 20 }, { x: 160, y: 100 }, (point) => ({
        x: point.x / 2,
        y: point.y / 2,
      }))
    ).toEqual({
      position: { x: 20, y: 10 },
      size: { width: 60, height: 40 },
    });
  });

  test("constrains shape drawing to equal dimensions while Shift is held", () => {
    const constrainEnd = (
      CanvasComponents as unknown as {
        constrainDrawEnd?: (
          start: { x: number; y: number },
          end: { x: number; y: number },
          lockAspect: boolean
        ) => { x: number; y: number };
      }
    ).constrainDrawEnd;

    expect(typeof constrainEnd).toBe("function");
    if (!constrainEnd) return;
    expect(constrainEnd({ x: 10, y: 10 }, { x: 80, y: 40 }, true)).toEqual({
      x: 80,
      y: 80,
    });
    expect(constrainEnd({ x: 80, y: 80 }, { x: 30, y: 60 }, true)).toEqual({
      x: 30,
      y: 30,
    });
    expect(constrainEnd({ x: 10, y: 10 }, { x: 80, y: 40 }, false)).toEqual({
      x: 80,
      y: 40,
    });
  });
});
