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
    readFile(path.join(reactSource, "styles.css"), "utf8"),
    readFile(path.join(reactSource, "preflight.scoped.css"), "utf8"),
    readFile(path.join(repositoryRoot, "packages/source-registry/registry/items/foundation-core/files/application/Agent.tsx"), "utf8"),
  ]);
  expect(styles).toContain(':is(.agent-ui-root, .agent-ui-conversation)[data-theme="light"]');
  expect(styles).toContain(':is(.agent-ui-root, .agent-ui-conversation)[data-theme="dark"]');
  expect(preflight).toContain(":is(.agent-ui-root, .agent-ui-conversation) button");
  expect(preflight).not.toMatch(/(?:^|,)\s*(?:button|input|body|html|:root|\*)\s*[{,]/mu);
  expect(agent).toContain("<AgentUIRoot theme={theme}>");
});

it("records five Portal target bridges and a separate Quote primitive bridge", async () => {
  const provenance = JSON.parse(await readFile(path.join(vendorRoot, "UPSTREAM.json"), "utf8")) as {
    files: { localPath: string; installedSha256: string; adaptations: string[] }[];
    patches: { id: string; files: string[] }[];
  };
  expect(provenance.patches).toEqual([{ id: "agent-ui-portal-container-bridge", files: portalFiles,
    reason: expect.any(String) }, {
    id: "agent-ui-quote-selection-portal-bridge",
    files: ["components/assistant-ui/elements/quote.aui.tsx"],
    reason: expect.any(String),
  }, {
    id: "agent-ui-trigger-content-seam",
    files: ["components/assistant-ui/elements/composer-trigger-popover.aui.tsx"],
    reason: expect.any(String),
  }]);
  const uses: string[] = [];
  for (const filePath of await sourceFiles(path.join(vendorRoot, "components"))) {
    if ((await readFile(filePath, "utf8")).includes("useAgentUIPortalContainer")) {
      uses.push(path.relative(vendorRoot, filePath).split(path.sep).join("/"));
    }
  }
  expect(uses.sort()).toEqual(portalFiles);
  for (const relativePath of portalFiles) {
    const content = await readFile(path.join(vendorRoot, relativePath));
    const entry = provenance.files.find((item) => item.localPath === relativePath);
    expect(entry?.adaptations).toContain("agent-ui-portal-container-bridge");
    expect(entry?.installedSha256).toBe(createHash("sha256").update(content).digest("hex"));
    expect(content.toString()).toContain(relativePath.endsWith("/image.tsx")
      ? "portalContainer ?? document.body" : "container: portalContainer");
  }
  const quotePath = "components/assistant-ui/elements/quote.aui.tsx";
  const quote = await readFile(path.join(vendorRoot, quotePath), "utf8");
  const quoteEntry = provenance.files.find(item => item.localPath === quotePath);
  expect(quoteEntry?.adaptations).toContain("agent-ui-quote-selection-portal-bridge");
  expect(quoteEntry?.adaptations).not.toContain("agent-ui-portal-container-bridge");
  expect(quote).toContain('from "../../../../../quote-selection-adapter.js"');
  expect(quoteEntry?.installedSha256).toBe(createHash("sha256").update(quote).digest("hex"));
  const report = await readFile(path.join(repositoryRoot, "scripts/generate-assistant-ui-upgrade-report.mjs"), "utf8");
  expect(report).toContain("portalIntegration");
  expect(report).toContain("Portal integration seam:");
  expect(report).toContain("quoteSelectionIntegration");
  expect(report).toContain("Quote selection integration seam:");
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
