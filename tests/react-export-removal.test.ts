import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const root = new URL("..", import.meta.url).pathname;

describe("React component export removal", () => {
  test("removes the exporter and every user-facing entry point", async () => {
    expect(await testFile(`${root}src/lib/react-export.ts`).exists()).toBe(false);
    expect(await testFile(`${root}tests/react-export.test.ts`).exists()).toBe(
      false
    );
    expect(await testFile(`${root}src/components/toolbar.tsx`).text()).not.toContain(
      "react-export"
    );
    expect(
      await testFile(`${root}src/components/settings-dialog.tsx`).text()
    ).not.toContain("Export React component");
  });
});
