import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { loadAgentUISourceRegistry } from "../src/index.js";

it("keeps official styled source and scoped CSS under Registry provenance", async () => {
  const registry = await loadAgentUISourceRegistry();
  const item = registry.byId.get("agent-component/assistant-ui-generative-ui")!;
  const integration = registry.byId.get("integration/generative-ui")!;
  const target = JSON.parse(await readFile(path.resolve(import.meta.dirname, "../../../assistant-ui-upgrade-target.json"), "utf8"));
  const provenance = JSON.parse(item.loadedFiles.find(file => file.target.endsWith("UPSTREAM.json"))!.content.toString("utf8"));
  expect(provenance.revision).toBe(item.upstream!.revision);
  expect(provenance.revision).toBe(target.generativeUiReleaseRevision);
  expect(integration.upstream!.revision).toBe(target.generativeUiReleaseRevision);
  expect(provenance.packages["@assistant-ui/react-generative-ui"]).toBe(target.packages["@assistant-ui/react-generative-ui"]);
  expect(item.packages?.["@assistant-ui/react-generative-ui"]).toBe(target.packages["@assistant-ui/react-generative-ui"]);
  expect(integration.packages?.["@assistant-ui/react-generative-ui"]).toBe(target.packages["@assistant-ui/react-generative-ui"]);
  expect(provenance.patches).toEqual([]);
  for (const file of provenance.files as { localPath: string; installedSha256: string; upstreamSha256: string; adaptations: string[] }[]) {
    const content = item.loadedFiles.find(source => source.target.endsWith(`/${file.localPath}`))!.content;
    expect(createHash("sha256").update(content).digest("hex")).toBe(file.installedSha256);
    if (file.localPath.endsWith(".tsx")) expect(file.installedSha256).toBe(file.upstreamSha256);
  }
  const css = item.loadedFiles.find(file => file.target.endsWith(".css"))!.content.toString("utf8");
  expect(css).toContain('.agent-ui-conversation [data-aui="button"]');
  expect(css).not.toMatch(/^\s*\[data-aui/m);
  expect(item.packages).toMatchObject({ "react-markdown": "10.1.0", "remark-gfm": "4.0.1" });
});
