import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, expectTypeOf, it } from "vitest";
import { parseSourceItem, type AgentUISourceItem } from "../src/index.js";

const item = {
  id: "foundation/example", kind: "foundation", description: "Example",
  requires: ["foundation/core"], packages: { react: "^19.2.0" },
  upstream: { project: "example", mode: "adapted", component: "example", revision: "a".repeat(40), license: "MIT" },
  files: [{ source: "files/example.ts", target: "example.ts" }],
};

it("uses stable IDs without an artificial version in the canonical type and schema", () => {
  expectTypeOf<"version">().not.toExtend<keyof AgentUISourceItem>();
  expect(parseSourceItem(item, "item.json")).toEqual(item);
  for (const version of ["0.1.0", "invalid", null]) {
    expect(() => parseSourceItem({ ...item, version }, "item.json")).toThrow();
  }
  expect(() => parseSourceItem({ ...item, requires: ["INVALID"] }, "item.json")).toThrow();
  expect(() => parseSourceItem({ ...item, packages: { react: "invalid" } }, "item.json")).toThrow();
  expect(() => parseSourceItem({ ...item, upstream: { mode: "invalid" } }, "item.json")).toThrow();
});

it("forbids version declarations in every Registry item manifest", async () => {
  const root = fileURLToPath(new URL("../registry/items/", import.meta.url));
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.name === "item.json") {
        expect(JSON.parse(await readFile(filename, "utf8")), filename).not.toHaveProperty("version");
      }
    }
  }
  await visit(root);
});
