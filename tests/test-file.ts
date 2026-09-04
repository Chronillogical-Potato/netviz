import { access, readFile } from "node:fs/promises";

export function testFile(path: string | URL) {
  return {
    text: () => readFile(path, "utf8"),
    json: async () => JSON.parse(await readFile(path, "utf8")),
    exists: async () => {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}
