import { describe, expect, test } from "vitest";
import { ICON_NAMES, canonicalIconName, loadIconCatalog, resolveIcon } from "../src/blocks/icons";

describe("deferred icon catalog", () => {
  test("retains every icon from the installed library", async () => {
    const catalog = await loadIconCatalog();
    const names = Object.entries(catalog)
      .filter(([name, value]) => /^[A-Z]/.test(name) && value && "$$typeof" in Object(value))
      .map(([name]) => name).sort();
    expect(ICON_NAMES).toEqual(names);
    for (const name of names) expect(canonicalIconName(name)).toBe(name);
  });

  test("caches deferred components and preserves aliases and fallback", () => {
    expect(resolveIcon("Ac")).toBe(resolveIcon("Ac"));
    expect(resolveIcon("database")).toBe(resolveIcon("Database"));
    expect(resolveIcon("unknown-icon")).toBe(resolveIcon("Box"));
    expect(canonicalIconName("unknown-icon")).toBe("");
    expect(canonicalIconName("")).toBe("");
  });

  test("shares the catalog request across callers", () => {
    expect(loadIconCatalog()).toBe(loadIconCatalog());
  });
});
