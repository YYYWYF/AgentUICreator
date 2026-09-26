import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { loadAgentUISourceRegistry } from "@agent-ui/source-registry";
it("keeps active Form fixtures byte-identical to installable Registry source", async () => {
  const registry = await loadAgentUISourceRegistry();
  const hash = (content: Buffer) => createHash("sha256").update(content).digest("hex");
  for (const id of ["integration/react-hook-form", "demo/frontend-tool-form"]) {
    for (const file of registry.byId.get(id)!.loadedFiles) {
      const fixture = await readFile(new URL(`./fixtures/official-form/${file.target}`, import.meta.url));
      expect(hash(fixture), file.target).toBe(hash(file.content));
    }
  }
});
