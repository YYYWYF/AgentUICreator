import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { loadAgentUISourceRegistry } from "../../src/source-catalog/index.js";

it("keeps official styled source and scoped CSS inside the runtime package", async () => {
  const registry = await loadAgentUISourceRegistry();
  const integration = registry.byId.get("integration/generative-ui")!;
  const target = JSON.parse(await readFile(path.resolve(import.meta.dirname, "../../../../assistant-ui-upgrade-target.json"), "utf8"));
  const directory = path.resolve(import.meta.dirname, "../../../plugins/src/internal/vendor-generated/assistant-ui/generative-ui");
  const provenance = JSON.parse(await readFile(path.join(directory, "UPSTREAM.json"), "utf8"));
  expect(provenance.revision).toBe(integration.upstream!.revision);
  expect(provenance.revision).toBe(target.generativeUiReleaseRevision);
  expect(integration.upstream!.revision).toBe(target.generativeUiReleaseRevision);
  expect(provenance.packages["@assistant-ui/react-generative-ui"]).toBe(target.packages["@assistant-ui/react-generative-ui"]);
  expect(registry.byId.get("agent-component/generative-ui")?.id).toBe("integration/generative-ui");
  expect(registry.byId.get("agent-component/assistant-ui-generative-ui")?.id).toBe("integration/generative-ui");
  expect(integration.packages).toEqual({ "@za38.03/agent-ui-plugins": "0.0.1" });
  expect(integration.files.map(file => file.target)).toContain("agent-ui/conversation/generative-ui.ts");
  expect(registry.items.some(entry => entry.id === "agent-component/generative-ui")).toBe(false);
  expect(provenance.patches).toEqual([]);
  for (const file of provenance.files as { localPath: string; installedSha256: string; upstreamSha256: string; adaptations: string[] }[]) {
    const content = await readFile(path.join(directory, file.localPath));
    expect(createHash("sha256").update(content).digest("hex")).toBe(file.installedSha256);
    if (file.localPath.endsWith(".tsx")) expect(file.installedSha256).toBe(file.upstreamSha256);
  }
  const css = await readFile(path.join(directory, "generative-ui.css"), "utf8");
  expect(css).toContain('.agent-ui-conversation [data-aui="button"]');
  expect(css).not.toMatch(/^\s*\[data-aui/m);
  expect(registry.items.flatMap(entry => entry.files).filter(file => /(^|\/)vendors?\//u.test(file.target))).toEqual([]);
});
