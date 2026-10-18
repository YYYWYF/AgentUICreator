// @vitest-environment node
import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "@za38.03/agent-ui-operator/source-registry";
import { checkGenerativeUiResource } from "../../../../scripts/check-generative-ui-resource.mjs";

it("keeps A2UI upstream source inside the package and verifies its pinned provenance", async () => {
  const registry = await loadAgentUISourceRegistry();
  const closure = resolveAgentUISourceItemClosure(registry, "integration/a2ui");
  expect(closure.flatMap(item => item.loadedFiles).filter(file => /(^|\/)vendors?\//u.test(file.target))).toEqual([]);
  expect(closure.find(item => item.id === "agent-component/assistant-ui-generative-ui")!.packages).toEqual({ "@za38.03/agent-ui-plugins": "0.0.1" });
  expect(await checkGenerativeUiResource()).toEqual([]);
  const source = await readFile(fileURLToPath(new URL("../../../plugins/src/internal/vendor-generated/assistant-ui/generative-ui/styled-generative-ui.tsx", import.meta.url)), "utf8");
  expect(source).toContain("defaultGenerativeUILibrary");
});
