import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist", import.meta.url));
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.name.endsWith(".js")) {
      const source = await readFile(path, "utf8");
      await writeFile(path, source.replace(/(from\s+["']\.\/.+?)(?<!\.js)(["'])/g, "$1.js$2"));
    }
  }
}
await visit(root);
