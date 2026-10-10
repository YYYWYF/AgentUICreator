import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const reactSource = path.join(repositoryRoot, "packages/react/src");
const vendorRoot = path.join(reactSource, "internal/vendor/assistant-ui");
const portalFiles = ["components/assistant-ui/elements/image.tsx", ...["dialog", "popover", "sheet", "tooltip"]
  .map((name) => `components/ui/${name}.tsx`)];

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(file));
    else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) files.push(file);
  }
  return files;
}

it("keeps the canonical theme and Preflight scoped to AgentUIRoot", async () => {
  const [styles, preflight, agent] = await Promise.all([
    readFile(path.join(reactSource, "theme/shadcn-theme-presets.css"), "utf8"),
    readFile(path.join(reactSource, "preflight.scoped.css"), "utf8"),
    readFile(path.join(repositoryRoot, "packages/source-registry/registry/items/foundation-core/files/application/Agent.tsx"), "utf8"),
  ]);
  expect(styles).toContain(':is(.agent-ui-root, .agent-ui-conversation)[data-theme="light"]');
  expect(styles).toContain(':is(.agent-ui-root, .agent-ui-conversation)[data-theme="dark"]');
  expect(preflight).toContain("[data-agent-ui-owned]");
  expect(preflight).not.toMatch(/^\s*(?:button|input|body|html|:root|\*)\s*[{,]/mu);
  expect(agent).toContain("<AgentUIRoot theme={theme}>");
});

it("keeps vendor product patches empty and product overlay integration separate", async () => {
  const provenance = JSON.parse(await readFile(path.join(vendorRoot, "UPSTREAM.json"), "utf8"));
  expect(provenance.patches).toEqual([]);
  for (const filePath of await sourceFiles(path.join(vendorRoot, "components"))) {
    const source = await readFile(filePath, "utf8");
    expect(source, filePath).not.toMatch(/useAgentUIPortalContainer|style-boundary|quote-selection-adapter|adapters\/assistant-ui/u);
  }
  const { checkProductAdapters } = await import("../scripts/sync-product-adapters.mjs");
  await expect(checkProductAdapters()).resolves.toBeUndefined();
});

it("keeps product Plugin and application code off Base UI Portal imports", async () => {
  const items = path.join(repositoryRoot, "packages/source-registry/registry/items");
  for (const filePath of await sourceFiles(items)) {
    const relativePath = path.relative(items, filePath);
    if (!/(?:^|\/)(?:plugins|application)\//u.test(relativePath)) continue;
    const content = await readFile(filePath, "utf8");
    expect(content, relativePath).not.toMatch(/from ["']@base-ui\/react\/(?:dialog|popover|tooltip|select|menu)["']/u);
  }
});

it("keeps Generative UI vocabulary under its independent scoped source contract", async () => {
  const directory = path.join(repositoryRoot, "packages/source-registry/registry/items/agent-component-assistant-ui-generative-ui/files/agent-ui/vendor/assistant-ui/generative-ui");
  const record = JSON.parse(await readFile(path.join(directory, "UPSTREAM.json"), "utf8"));
  for (const entry of record.files) {
    const source = await readFile(path.join(directory, entry.localPath));
    expect(createHash("sha256").update(source).digest("hex")).toBe(entry.installedSha256);
  }
  const css = await readFile(path.join(directory, "generative-ui.css"), "utf8");
  expect(css).toContain('.agent-ui-conversation [data-aui="button"]:focus-visible');
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
});
