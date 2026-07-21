import { describe, expect, test } from "bun:test";

const root = new URL("..", import.meta.url).pathname;

describe("React component export removal", () => {
  test("removes the exporter and every user-facing entry point", async () => {
    expect(await Bun.file(`${root}src/lib/react-export.ts`).exists()).toBe(false);
    expect(await Bun.file(`${root}tests/react-export.test.ts`).exists()).toBe(
      false
    );
    expect(await Bun.file(`${root}src/components/toolbar.tsx`).text()).not.toContain(
      "react-export"
    );
    expect(
      await Bun.file(`${root}src/components/settings-dialog.tsx`).text()
    ).not.toContain("Export React component");
  });
});
