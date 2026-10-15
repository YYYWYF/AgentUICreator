import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { loadAgentUISourceRegistry } from "../src/index.js";

it("keeps official styled source and scoped CSS inside the runtime package", async () => {
  const registry = await loadAgentUISourceRegistry();
  const item = registry.byId.get("agent-component/assistant-ui-generative-ui")!;
  const integration = registry.byId.get("integration/generative-ui")!;
  const target = JSON.parse(await readFile(path.resolve(import.meta.dirname, "../../../assistant-ui-upgrade-target.json"), "utf8"));
  const directory = path.resolve(import.meta.dirname, "../../react/src/internal/vendor/assistant-ui/generative-ui");
  const provenance = JSON.parse(await readFile(path.join(directory, "UPSTREAM.json"), "utf8"));
  expect(provenance.revision).toBe(item.upstream!.revision);
  expect(provenance.revision).toBe(target.generativeUiReleaseRevision);
  expect(integration.upstream!.revision).toBe(target.generativeUiReleaseRevision);
  expect(provenance.packages["@assistant-ui/react-generative-ui"]).toBe(target.packages["@assistant-ui/react-generative-ui"]);
  expect(item.packages).toEqual({ "@za38.03/agent-ui-react": "0.1.6" });
  expect(integration.packages).toEqual(item.packages);
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
