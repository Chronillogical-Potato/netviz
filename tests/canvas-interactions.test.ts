import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";
import * as CanvasComponents from "../src/components/canvas";

describe("canvas tool interactions", () => {
  test("uses a larger, sharper dimension badge", () => {
    const badgeClass = (
      CanvasComponents as unknown as { DIMENSION_BADGE_CLASS?: string }
    ).DIMENSION_BADGE_CLASS;

    expect(typeof badgeClass).toBe("string");
    expect(badgeClass).toContain("text-xs");
    expect(badgeClass).toContain("rounded-[2px]");
    expect(badgeClass).toContain("px-1.5");
  });

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

  test("uses a neutral grey connection preview", async () => {
    const source = await testFile(
      new URL("../src/components/canvas.tsx", import.meta.url)
    ).text();
    const popover = source.slice(
      source.indexOf("{!isPlaybackOnly && connectPopover"),
      source.indexOf("export function Canvas")
    );

    expect(popover).toContain('stroke="hsl(var(--muted-foreground))"');
    expect(popover).toContain('fill="hsl(var(--muted-foreground))"');
    expect(popover).not.toContain("connect-popover-grad");
  });

  test("matches the larger block selector row styling", async () => {
    const source = await testFile(
      new URL("../src/components/canvas.tsx", import.meta.url)
    ).text();
    const popover = source.slice(
      source.indexOf("{!isPlaybackOnly && connectPopover"),
      source.indexOf("export function Canvas")
    );

    expect(popover).toContain("w-80");
    expect(popover).toContain("h-8 w-8");
    expect(popover).toContain("text-[13px] font-semibold text-foreground/80");
    expect(popover).not.toContain("b.subtitle");
  });

  test("keeps the quick-connect picker inside the viewport", async () => {
    const getPosition = (
      CanvasComponents as unknown as {
        getConnectPickerPosition?: (
          point: { x: number; y: number },
          viewport: { width: number; height: number }
        ) => { left: number; top: number };
      }
    ).getConnectPickerPosition;

    expect(typeof getPosition).toBe("function");
    if (!getPosition) return;
    expect(getPosition({ x: 400, y: 180 }, { width: 920, height: 720 })).toEqual({
      left: 400,
      top: 180,
    });
    expect(getPosition({ x: 900, y: 700 }, { width: 920, height: 720 })).toEqual({
      left: 592,
      top: 312,
    });
    expect(getPosition({ x: 0, y: 0 }, { width: 920, height: 300 })).toEqual({
      left: 8,
      top: 8,
    });

    const source = await testFile(
      new URL("../src/components/canvas.tsx", import.meta.url)
    ).text();
    expect(source).toContain(
      'maxHeight: "min(400px, calc(100vh - 16px))"'
    );
    expect(source).toContain("min-h-0 flex-1");
  });
});
