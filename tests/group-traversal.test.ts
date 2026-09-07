import { describe, expect, test } from "vitest";
import { descendantGroupIds, type Group } from "../src/store/flow-store";

const group = (id: string, parentGroupId: string | null) =>
  ({ id, parentGroupId } as Group);

describe("group traversal", () => {
  test("includes only the root and its descendants regardless of ordering", () => {
    const groups = [group("leaf", "child"), group("other", null), group("child", "root")];
    expect(descendantGroupIds(groups, "root")).toEqual(new Set(["root", "child", "leaf"]));
  });
  test("terminates on cyclic data", () => {
    expect(descendantGroupIds([group("a", "b"), group("b", "a")], "a"))
      .toEqual(new Set(["a", "b"]));
  });
  test("handles deep reverse-ordered hierarchies without recursion", () => {
    const groups = Array.from({ length: 10000 }, (_, i) => group(String(i + 1), String(i))).reverse();
    expect(descendantGroupIds(groups, "0").size).toBe(10001);
  });
});
