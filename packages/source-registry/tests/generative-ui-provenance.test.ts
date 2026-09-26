import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { loadAgentUISourceRegistry } from "../src/index.js";

it("keeps official styled source and scoped CSS under Registry provenance", async () => {
  const registry = await loadAgentUISourceRegistry();
  const item = registry.byId.get("agent-component/assistant-ui-generative-ui")!;
  const provenance = JSON.parse(item.loadedFiles.find(file => file.target.endsWith("UPSTREAM.json"))!.content);
  expect(provenance.revision).toBe(item.upstream!.revision);
  expect(provenance.patches).toEqual([]);
  for (const file of provenance.files as { localPath: string; installedSha256: string; upstreamSha256: string; adaptations: string[] }[]) {
    const content = item.loadedFiles.find(source => source.target.endsWith(`/${file.localPath}`))!.content;
    expect(createHash("sha256").update(content).digest("hex")).toBe(file.installedSha256);
    if (file.localPath.endsWith(".tsx")) expect(file.installedSha256).toBe(file.upstreamSha256);
  }
  const css = item.loadedFiles.find(file => file.target.endsWith(".css"))!.content;
  expect(css).toContain('.agent-ui-conversation [data-aui="button"]');
  expect(css).not.toMatch(/^\s*\[data-aui/m);
  expect(item.packages).toMatchObject({ "react-markdown": "10.1.0", "remark-gfm": "4.0.1" });
});
