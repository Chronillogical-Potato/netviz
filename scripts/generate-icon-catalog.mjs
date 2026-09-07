import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

// Metadata only: keep the complete searchable catalog without eagerly bundling it.
const source = await readFile(fileURLToPath(import.meta.resolve("reicon-react")), "utf8");
const names = [...source.matchAll(/export \{ (\w+) \} from '\.\/icons\//g)]
  .map((match) => match[1]).sort();
if (!names.length) throw new Error("No reicon exports found");
await writeFile(new URL("../src/blocks/icon-names.json", import.meta.url), JSON.stringify(names) + "\n");
