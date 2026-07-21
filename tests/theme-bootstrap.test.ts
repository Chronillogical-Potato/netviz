import { describe, expect, test } from "bun:test";

describe("theme bootstrap", () => {
  test("applies the saved theme and background before the app bundle loads", async () => {
    const html = await Bun.file(
      new URL("../index.html", import.meta.url)
    ).text();
    const bootstrapIndex = html.indexOf("data-theme-bootstrap");
    const appIndex = html.indexOf('/src/main.tsx');

    expect(bootstrapIndex).toBeGreaterThan(-1);
    expect(bootstrapIndex).toBeLessThan(appIndex);
    expect(html).toContain('localStorage.getItem("theme")');
    expect(html).toContain("html.dark");
    expect(html).toContain("background: #0a0a0a");
    expect(html).toContain("html.light");
    expect(html).toContain("background: #ffffff");
  });

  test("keeps the System option aligned with the pre-paint bootstrap", async () => {
    const provider = await Bun.file(
      new URL("../src/components/theme-provider.tsx", import.meta.url)
    ).text();

    expect(provider).toContain("enableSystem");
    expect(provider).not.toContain("enableSystem={false}");
  });
});
