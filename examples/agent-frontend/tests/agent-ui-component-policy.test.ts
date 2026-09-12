import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(projectRoot, "../..");
const registryRoot = path.join(workspaceRoot, "packages/source-registry/registry");
const spikeSourceRoot = path.join(projectRoot, "src/spikes/assistant-ui");
const assistantUiVendorRoot = path.join(
  projectRoot,
  "agent-ui/vendor/assistant-ui",
);
const assistantUiAdapterRoot = path.join(
  projectRoot,
  "agent-ui/adapters/assistant-ui",
);
const assistantUiRegistryRoot = path.join(
  registryRoot,
  "items/foundation-assistant-ui-conversation/files/vendor/assistant-ui",
);
const spikePluginRoot = path.join(
  projectRoot,
  "plugins/assistant-ui-conversation-spike",
);
const generatedProjectPackagePath = path.join(projectRoot, "package.json");
const assistantUiRuntimePackagePath = path.join(
  workspaceRoot,
  "packages/runtime-assistant-ui/package.json",
);
const forbiddenManagedDependencies = [
  /^@?assistant-ui(?:\/|$)/u,
  /^tailwindcss$/u,
  /^class-variance-authority$/u,
  /^lucide-react$/u,
  /^@radix-ui\//u,
] as const;

async function collectFiles(
  root: string,
  predicate: (filePath: string) => boolean,
): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if ([
        "node_modules",
        ".git",
        ".pnpm-store",
        ".venv",
        "dist",
        "build",
      ].includes(entry.name)) return [];
      return collectFiles(entryPath, predicate);
    }
    return entry.isFile() && predicate(entryPath) ? [entryPath] : [];
  }));
  return nested.flat().sort();
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(
    /(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/gu,
  )].map((match) => match[1] ?? "");
}

describe("Agent UI component source policy", () => {
  it("confines assistant-ui imports to the formal vendor source", async () => {
    const sourceFiles = [
      ...await collectFiles(path.join(projectRoot, "agent-ui"), (filePath) => /\.[cm]?[jt]sx?$/u.test(filePath)),
      ...await collectFiles(registryRoot, (filePath) => /\.[cm]?[jt]sx?$/u.test(filePath)),
    ];
    for (const filePath of sourceFiles) {
      for (const specifier of importSpecifiers(await readFile(filePath, "utf8"))) {
        if (!/^@?assistant-ui(?:\/|$)/u.test(specifier)) continue;
        expect(
          filePath.startsWith(`${assistantUiVendorRoot}${path.sep}`) ||
            filePath.startsWith(`${assistantUiRegistryRoot}${path.sep}`),
          filePath,
        ).toBe(true);
      }
    }
  });

  it("keeps assistant-ui presentation and Runtime packages in the generated project", async () => {
    const packageFiles = await collectFiles(workspaceRoot, (filePath) => {
      const relative = path.relative(workspaceRoot, filePath);
      return path.basename(filePath) === "package.json" &&
        !relative.split(path.sep).includes("node_modules");
    });
    for (const filePath of packageFiles) {
      const manifest = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
      for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const dependencies = manifest[field];
        if (dependencies === undefined || dependencies === null || typeof dependencies !== "object") continue;
        for (const dependency of Object.keys(dependencies)) {
          const isForbidden = forbiddenManagedDependencies.some((pattern) =>
            pattern.test(dependency),
          );
          if (!isForbidden) continue;
          expect(
            [generatedProjectPackagePath, assistantUiRuntimePackagePath],
            dependency,
          ).toContain(filePath);
        }
      }
    }
  });

  it("keeps assistant-ui dependencies within the formal surface and Spike harness", async () => {
    const productionRoots = [
      "agent-ui",
      "framework",
      "plugins",
      "runtime",
      "services",
      "src",
    ].map((directory) => path.join(projectRoot, directory));
    const sourceFiles = (
      await Promise.all(
        productionRoots.map((root) =>
          collectFiles(root, (filePath) => /\.[cm]?[jt]sx?$/u.test(filePath)),
        ),
      )
    ).flat();
    const spikeDependency =
      /^(?:@assistant-ui\/|@ag-ui\/client$|class-variance-authority$|cn$|lucide-react$|remark-gfm$|tw-shimmer$|zustand$)/u;

    for (const filePath of sourceFiles) {
      const relativePath = path.relative(projectRoot, filePath);
      const allowed =
        filePath.startsWith(`${spikeSourceRoot}${path.sep}`) ||
        filePath.startsWith(`${spikePluginRoot}${path.sep}`) ||
        filePath.startsWith(`${assistantUiVendorRoot}${path.sep}`) ||
        filePath.startsWith(`${assistantUiAdapterRoot}${path.sep}`);
      for (const specifier of importSpecifiers(await readFile(filePath, "utf8"))) {
        if (spikeDependency.test(specifier)) {
          expect(allowed, `${relativePath}: ${specifier}`).toBe(true);
        }
      }
    }
  });

  it("keeps private assistant-ui source out of ordinary Plugins", async () => {
    const pluginFiles = await collectFiles(
      path.join(projectRoot, "plugins"),
      (filePath) => /\.[cm]?[jt]sx?$/u.test(filePath),
    );
    const privateSource = [
      "src", "spikes", "assistant-ui", "components",
    ].join("/");
    const formalVendor = [
      "agent-ui", "vendor", "assistant-ui",
    ].join("/");

    for (const filePath of pluginFiles) {
      for (const specifier of importSpecifiers(await readFile(filePath, "utf8"))) {
        expect(specifier, filePath).not.toContain(privateSource);
        expect(specifier, filePath).not.toContain(formalVendor);
      }
    }
  });

  it("limits the Composer to React and local Agent UI source", async () => {
    const composerPath = path.join(
      registryRoot,
      "items/agent-component-composer/files/components/composer.tsx",
    );
    const source = await readFile(composerPath, "utf8");
    const specifiers = importSpecifiers(source);
    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(/className\s*=\s*["']/u);
    expect(source).not.toMatch(/@base-ui\/react|@radix-ui\/|@ant-design\/x|\bantd\b|tailwindcss|class-variance-authority/u);
  });

  it("keeps Agent Message presentation-only and dependency-free", async () => {
    const messageRoot = path.join(
      registryRoot,
      "items/agent-component-message/files/components",
    );
    const source = await readFile(path.join(messageRoot, "message.tsx"), "utf8");
    const specifiers = importSpecifiers(source);
    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(
      /@assistant-ui\/|@base-ui\/react|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|tailwindcss|class-variance-authority|lucide-react|@radix-ui\//u,
    );
    expect(source).not.toMatch(
      /@agent-ui\/runtime-core|@agent-ui\/runtime-agui|(?:^|["'/])runtime\/|services\/conversations|framework\/contracts\/ui-plugin/u,
    );
    expect(source).not.toMatch(/messageId|threadId|runId|toolCalls|reasoning|attachments|sources/u);
  });

  it("keeps Agent Message colors tokenized and CSS isolated", async () => {
    const css = await readFile(
      path.join(
        registryRoot,
        "items/agent-component-message/files/components/message.module.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(
      /(?:^|\})\s*(?:body|html)\s*(?:,|\{)|\[data-agent-ui-root\]|:global|\.ant-/gmu,
    );
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the managed Agent Message copy byte-identical to Registry source", async () => {
    for (const fileName of ["message.tsx", "message.module.css"]) {
      const registrySource = await readFile(
        path.join(
          registryRoot,
          "items/agent-component-message/files/components",
          fileName,
        ),
        "utf8",
      );
      const installedSource = await readFile(
        path.join(projectRoot, "agent-ui/components", fileName),
        "utf8",
      );
      expect(installedSource).toBe(registrySource);
    }
  });

  it("keeps Agent Reasoning presentation-only and lifecycle-free", async () => {
    const reasoningRoot = path.join(
      registryRoot,
      "items/agent-component-reasoning/files/components",
    );
    const source = await readFile(path.join(reasoningRoot, "reasoning.tsx"), "utf8");
    const specifiers = importSpecifiers(source);

    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(
      /@assistant-ui(?:\/|$)|@base-ui\/react|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|tailwindcss|class-variance-authority|lucide-react|@radix-ui\//u,
    );
    expect(source).not.toMatch(
      /@agent-ui\/runtime-core|@agent-ui\/runtime-agui|@agent-ui\/runtime-react|(?:^|["'/])runtime\/|services\/|framework\/contracts\//u,
    );
    expect(source).not.toMatch(
      /\b(?:useState|useEffect|useLayoutEffect|setTimeout|clearTimeout|defaultExpanded|collapseOnComplete|collapseDelayMs|execution|turnId|messageId|runStatus|onComplete|autoCollapse)\b/u,
    );
  });

  it("keeps Agent Reasoning colors tokenized and CSS isolated", async () => {
    const css = await readFile(
      path.join(
        registryRoot,
        "items/agent-component-reasoning/files/components/reasoning.module.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).toMatch(/linear-gradient\s*\([^;]*var\(--aui-/u);
    expect(css).not.toMatch(
      /(?:linear|radial)-gradient\s*\([^;}]*(?:#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\()/u,
    );
    expect(css).not.toMatch(
      /(?:^|\})\s*(?:body|html)\s*(?:,|\{)|\[data-agent-ui-root\]|:global|\.ant-/gmu,
    );
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the managed Agent Reasoning copy byte-identical to Registry source", async () => {
    for (const fileName of ["reasoning.tsx", "reasoning.module.css"]) {
      const registrySource = await readFile(
        path.join(
          registryRoot,
          "items/agent-component-reasoning/files/components",
          fileName,
        ),
        "utf8",
      );
      const installedSource = await readFile(
        path.join(projectRoot, "agent-ui/components", fileName),
        "utf8",
      );
      expect(installedSource).toBe(registrySource);
    }
  });

  it("keeps Agent Attachments and Sources presentation-only and tokenized", async () => {
    for (const component of ["attachments", "sources"]) {
      const componentRoot = path.join(
        registryRoot,
        `items/agent-component-${component}/files/components`,
      );
      const source = await readFile(
        path.join(componentRoot, `${component}.tsx`),
        "utf8",
      );
      const specifiers = importSpecifiers(source);
      expect(specifiers).toContain("react");
      expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
        .toBe(true);
      expect(source).not.toMatch(
        /@assistant-ui(?:\/|$)|@base-ui\/react|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|tailwindcss|class-variance-authority|lucide-react|@radix-ui\//u,
      );
      expect(source).not.toMatch(
        /@agent-ui\/runtime-core|@agent-ui\/runtime-agui|@agent-ui\/runtime-react|(?:^|["'/])runtime\/|services\/|framework\/contracts\/|MessageRenderContext|AgentMessage|PluginInstance|useAgentMessages|useAgentState/u,
      );

      const css = await readFile(
        path.join(componentRoot, `${component}.module.css`),
        "utf8",
      );
      expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
      expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
      expect(css).not.toMatch(
        /(?:^|\})\s*(?:body|html)\s*(?:,|\{)|\[data-agent-ui-root\]|:global|\.ant-|development-preview|--ui-/gmu,
      );
      expect(css).toMatch(/var\(--aui-/u);
    }
  });

  it("keeps managed Agent Attachments and Sources byte-identical to Registry source", async () => {
    for (const component of ["attachments", "sources"]) {
      for (const fileName of [`${component}.tsx`, `${component}.module.css`]) {
        const registrySource = await readFile(
          path.join(
            registryRoot,
            `items/agent-component-${component}/files/components`,
            fileName,
          ),
          "utf8",
        );
        const installedSource = await readFile(
          path.join(projectRoot, "agent-ui/components", fileName),
          "utf8",
        );
        expect(installedSource).toBe(registrySource);
      }
    }
  });

  it("keeps Message Part renderer plugins context-only and independent of Ant", async () => {
    const policies = [
      ["agent-message-attachments", "useMessageAttachmentsRenderContext", /useAgentMessages|useAgentState|inspectAttachments/u],
      ["agent-message-sources", "useMessageSourcesRenderContext", /useAgentMessages|useAgentState|inspectSources/u],
    ] as const;
    for (const [pluginId, requiredHook, forbidden] of policies) {
      const source = await readFile(
        path.join(projectRoot, "plugins", pluginId, "index.tsx"),
        "utf8",
      );
      expect(source).toContain(requiredHook);
      expect(source).not.toMatch(forbidden);
      expect(source).not.toMatch(
        /@assistant-ui(?:\/|$)|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']/u,
      );
    }
  });

  it("keeps Attachments and Sources identities canonical across model and registries", async () => {
    const appUI = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui/app-ui.json"), "utf8"),
    ) as { pluginInstances?: Record<string, { pluginId?: string; mount?: { slotId?: string } }> };
    const registry = await readFile(
      path.join(projectRoot, "plugins/registry.generated.ts"),
      "utf8",
    );
    const templateLibrary = await readFile(
      path.join(projectRoot, "plugins/antd-x-template-library/index.ts"),
      "utf8",
    );

    for (const [part, definition, component] of [
      ["attachments", "agentMessageAttachmentsPlugin", "AgentMessageAttachmentsPlugin"],
      ["sources", "agentMessageSourcesPlugin", "AgentMessageSourcesPlugin"],
    ] as const) {
      const pluginId = `agent-message-${part}`;
      expect(appUI.pluginInstances?.[`${pluginId}-main`]).toMatchObject({
        pluginId,
        mount: { slotId: `conversation.message.${part}` },
      });
      expect(registry).toContain(`./${pluginId}/definition`);
      expect(templateLibrary).toContain(definition);
      expect(templateLibrary).toContain(component);
    }
  });

  it("keeps Agent Tool presentation-only, controlled, and lifecycle-free", async () => {
    const toolRoot = path.join(
      registryRoot,
      "items/agent-component-tool/files/components",
    );
    const source = await readFile(path.join(toolRoot, "tool.tsx"), "utf8");
    const specifiers = importSpecifiers(source);

    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(
      /@assistant-ui(?:\/|$)|@base-ui\/react|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|tailwindcss|class-variance-authority|lucide-react|@radix-ui\//u,
    );
    expect(source).not.toMatch(
      /@agent-ui\/runtime-core|@agent-ui\/runtime-agui|@agent-ui\/runtime-react|(?:^|["'/])runtime\/|services\/|framework\/contracts\//u,
    );
    expect(source).not.toMatch(
      /\b(?:useState|useEffect|useLayoutEffect|setTimeout|clearTimeout|defaultExpanded|autoExpand|autoCollapse)\b/u,
    );
    expect(source).not.toMatch(
      /\b(?:parseToolValue|StructuredValue|ScalarValue|resultCount|looksLikeFilePath|showArguments|showResult|toolCall|execution|result|turnId|InspectionStatus)\b/u,
    );
  });

  it("keeps Agent Tool colors tokenized and CSS isolated", async () => {
    const css = await readFile(
      path.join(
        registryRoot,
        "items/agent-component-tool/files/components/tool.module.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(
      /(?:^|\})\s*(?:body|html)\s*(?:,|\{)|\[data-agent-ui-root\]|:global|\.ant-/gmu,
    );
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the managed Agent Tool copy byte-identical to Registry source", async () => {
    for (const fileName of ["tool.tsx", "tool.module.css"]) {
      const registrySource = await readFile(
        path.join(
          registryRoot,
          "items/agent-component-tool/files/components",
          fileName,
        ),
        "utf8",
      );
      const installedSource = await readFile(
        path.join(projectRoot, "agent-ui/components", fileName),
        "utf8",
      );
      expect(installedSource).toBe(registrySource);
    }
  });

  it("keeps Agent Tool Activity presentation-only, controlled, and lifecycle-free", async () => {
    const activityRoot = path.join(
      registryRoot,
      "items/agent-component-tool-activity/files/components",
    );
    const source = await readFile(
      path.join(activityRoot, "tool-activity.tsx"),
      "utf8",
    );
    const specifiers = importSpecifiers(source);

    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(
      /@assistant-ui(?:\/|$)|@base-ui\/react|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|tailwindcss|class-variance-authority|lucide-react|@radix-ui\//u,
    );
    expect(source).not.toMatch(
      /@agent-ui\/runtime-core|@agent-ui\/runtime-agui|@agent-ui\/runtime-react|(?:^|["'/])runtime\/|services\/|framework\/contracts\//u,
    );
    expect(source).not.toMatch(
      /\b(?:useState|useEffect|useLayoutEffect|setTimeout|clearTimeout|defaultExpanded|autoExpand|autoCollapse)\b/u,
    );
    expect(source).not.toMatch(
      /\b(?:ToolPresentationItem|activeToolCallIds|turnId|toolCallIds|failedCount|toolCount)\b/u,
    );
    expect(source).toMatch(/<CollapsibleContent\s+[\s\S]*?keepMounted/u);
  });

  it("keeps Agent Tool Activity colors tokenized and CSS isolated", async () => {
    const css = await readFile(
      path.join(
        registryRoot,
        "items/agent-component-tool-activity/files/components/tool-activity.module.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(
      /(?:^|\})\s*(?:body|html)\s*(?:,|\{)|\[data-agent-ui-root\]|:global|\.ant-|development-preview|--ui-/gmu,
    );
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the managed Agent Tool Activity copy byte-identical to Registry source", async () => {
    for (const fileName of ["tool-activity.tsx", "tool-activity.module.css"]) {
      const registrySource = await readFile(
        path.join(
          registryRoot,
          "items/agent-component-tool-activity/files/components",
          fileName,
        ),
        "utf8",
      );
      const installedSource = await readFile(
        path.join(projectRoot, "agent-ui/components", fileName),
        "utf8",
      );
      expect(installedSource).toBe(registrySource);
    }
  });

  it("keeps Agent Tool Detail presentation-only and free of tool runtime facts", async () => {
    const detailRoot = path.join(
      registryRoot,
      "items/agent-component-tool-detail/files/components",
    );
    const source = await readFile(
      path.join(detailRoot, "tool-detail.tsx"),
      "utf8",
    );
    const specifiers = importSpecifiers(source);

    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(
      /@assistant-ui(?:\/|$)|@base-ui\/react|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|tailwindcss|class-variance-authority|lucide-react|@radix-ui\//u,
    );
    expect(source).not.toMatch(
      /@agent-ui\/runtime-core|@agent-ui\/runtime-agui|@agent-ui\/runtime-react|(?:^|["'/])runtime\/|services\/|framework\/contracts\//u,
    );
    expect(source).not.toMatch(
      /\b(?:useState|useEffect|useLayoutEffect|ToolCallInspection|inspectToolCalls|AgentMessage|AgentExecution|selectedToolCallId|requestedToolCallId|argumentsText)\b|result\.error|agentUI\.render/u,
    );
  });

  it("keeps Agent Tool Detail colors tokenized and CSS isolated", async () => {
    const css = await readFile(
      path.join(
        registryRoot,
        "items/agent-component-tool-detail/files/components/tool-detail.module.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(
      /(?:^|\})\s*(?:body|html)\s*(?:,|\{)|\[data-agent-ui-root\]|:global|\.ant-|development-preview|--ui-/gmu,
    );
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the managed Agent Tool Detail copy byte-identical to Registry source", async () => {
    for (const fileName of ["tool-detail.tsx", "tool-detail.module.css"]) {
      const registrySource = await readFile(
        path.join(
          registryRoot,
          "items/agent-component-tool-detail/files/components",
          fileName,
        ),
        "utf8",
      );
      const installedSource = await readFile(
        path.join(projectRoot, "agent-ui/components", fileName),
        "utf8",
      );
      expect(installedSource).toBe(registrySource);
    }
  });

  it("keeps Agent Tool Detail plugin canonical and independent of Ant", async () => {
    const pluginRoot = path.join(projectRoot, "plugins/agent-tool-detail");
    const manifest = JSON.parse(
      await readFile(path.join(pluginRoot, "manifest.json"), "utf8"),
    ) as { id: string; name: string; version: string };
    const sourceFiles = await collectFiles(
      pluginRoot,
      (filePath) => /\.(?:css|ts|tsx)$/u.test(filePath),
    );

    expect(manifest).toMatchObject({
      id: "agent-tool-detail",
      name: "Agent Tool Detail",
      version: "1.1.0",
    });
    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf8");
      expect(source, filePath).not.toMatch(
        /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-|<Mermaid\b|\b(?:ApiOutlined|CheckCircleOutlined|CloseCircleOutlined|LoadingOutlined|StopOutlined|CodeHighlighter|Alert|Empty|Select|Tag|Typography)\b/u,
      );
    }

    const indexSource = await readFile(path.join(pluginRoot, "index.tsx"), "utf8");
    expect(importSpecifiers(indexSource)).toContain(
      "../../agent-ui/components/tool-detail",
    );
    expect(indexSource).toMatch(/<AgentToolDetail\b/u);

    const css = await readFile(path.join(pluginRoot, "styles.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(/\.ant-|development-preview|--ui-/u);
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the Agent Tool Detail identity and AppUIModel contract canonical", async () => {
    const appUI = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui/app-ui.json"), "utf8"),
    ) as {
      pluginInstances?: Record<string, {
        enabled?: boolean;
        id?: string;
        mount?: { slotId?: string };
        pluginId?: string;
        props?: Record<string, unknown>;
      }>;
    };
    const instance = appUI.pluginInstances?.["agent-tool-detail-main"];
    const registry = await readFile(
      path.join(projectRoot, "plugins/registry.generated.ts"),
      "utf8",
    );
    const templateLibrary = await readFile(
      path.join(projectRoot, "plugins/antd-x-template-library/index.ts"),
      "utf8",
    );

    expect(instance).toEqual({
      id: "agent-tool-detail-main",
      pluginId: "agent-tool-detail",
      enabled: true,
      mount: { slotId: "inspector.tool" },
      props: { toolCallId: "tool-call-render-diagram" },
    });
    expect(registry).toContain('./agent-tool-detail/definition');
    expect(templateLibrary).toContain("agentToolDetailPlugin");
    expect(templateLibrary).toContain("AgentToolDetailPlugin");
  });

  it("keeps removed Tool Detail identities out of the generated project", async () => {
    const removedIdentities = [
      ["antd", "x", "tool", "detail"].join("-"),
      ["Antd", "X", "Tool", "Detail"].join(""),
      ["antd", "X", "Tool", "Detail", "Plugin"].join(""),
    ];
    const oldPluginRoot = path.join(projectRoot, "plugins", removedIdentities[0]!);
    const violations: string[] = [];

    await expect(stat(oldPluginRoot)).rejects.toMatchObject({ code: "ENOENT" });
    for (const filePath of await collectFiles(
      projectRoot,
      (candidate) => /\.(?:css|json|md|ts|tsx)$/u.test(candidate),
    )) {
      const source = await readFile(filePath, "utf8");
      if (removedIdentities.some((identity) => source.includes(identity))) {
        violations.push(path.relative(projectRoot, filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the Agent Tool Activity plugin canonical and independent of Ant", async () => {
    const pluginRoot = path.join(projectRoot, "plugins/agent-tool-activity");
    const manifest = JSON.parse(
      await readFile(path.join(pluginRoot, "manifest.json"), "utf8"),
    ) as { id: string; name: string; version: string };
    const sourceFiles = await collectFiles(
      pluginRoot,
      (filePath) => /\.(?:css|ts|tsx)$/u.test(filePath),
    );

    expect(manifest).toMatchObject({
      id: "agent-tool-activity",
      name: "Agent Tool Activity",
      version: "1.1.0",
    });
    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf8");
      expect(source, filePath).not.toMatch(
        /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-|\b(?:Collapse|CollapseProps|LoadingOutlined|CheckCircleOutlined|WarningOutlined|StopOutlined)\b/u,
      );
    }

    const indexSource = await readFile(path.join(pluginRoot, "index.tsx"), "utf8");
    expect(importSpecifiers(indexSource)).toContain(
      "../../agent-ui/components/tool-activity",
    );
    expect(indexSource).toMatch(/<AgentToolActivity\b/u);

    const css = await readFile(path.join(pluginRoot, "styles.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(/\.ant-|development-preview|--ui-/u);
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the Agent Tool Activity identity canonical across the generated project", async () => {
    const appUI = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui/app-ui.json"), "utf8"),
    ) as { pluginInstances?: Record<string, { pluginId?: string }> };
    const registry = await readFile(
      path.join(projectRoot, "plugins/registry.generated.ts"),
      "utf8",
    );
    const templateLibrary = await readFile(
      path.join(projectRoot, "plugins/antd-x-template-library/index.ts"),
      "utf8",
    );

    expect(appUI.pluginInstances?.["agent-tool-activity-main"]?.pluginId).toBe(
      "agent-tool-activity",
    );
    expect(registry).toContain('./agent-tool-activity/definition');
    expect(templateLibrary).toContain("agentToolActivityPlugin");
    expect(templateLibrary).toContain("AgentToolActivityPlugin");
  });

  it("keeps removed Tool Activity identities out of the generated project", async () => {
    const removedIdentities = [
      ["antd", "x", "tool", "activity"].join("-"),
      ["Antd", "X", "Tool", "Activity"].join(""),
      ["antd", "X", "Tool", "Activity", "Plugin"].join(""),
    ];
    const oldPluginRoot = path.join(projectRoot, "plugins", removedIdentities[0]!);
    const violations: string[] = [];

    await expect(stat(oldPluginRoot)).rejects.toMatchObject({ code: "ENOENT" });
    for (const filePath of await collectFiles(
      projectRoot,
      (candidate) => /\.(?:css|json|md|ts|tsx)$/u.test(candidate),
    )) {
      const source = await readFile(filePath, "utf8");
      if (removedIdentities.some((identity) => source.includes(identity))) {
        violations.push(path.relative(projectRoot, filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the Agent Tool plugin canonical and independent of Ant", async () => {
    const pluginRoot = path.join(projectRoot, "plugins/agent-tool");
    const manifest = JSON.parse(
      await readFile(path.join(pluginRoot, "manifest.json"), "utf8"),
    ) as { id: string; name: string; version: string };
    const sourceFiles = await collectFiles(
      pluginRoot,
      (filePath) => /\.(?:css|ts|tsx)$/u.test(filePath),
    );

    expect(manifest).toMatchObject({
      id: "agent-tool",
      name: "Agent Tool",
      version: "1.1.0",
    });
    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf8");
      expect(source, filePath).not.toMatch(
        /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-|\b(?:Collapse|Alert|Typography|ToolOutlined|LoadingOutlined|CheckCircleOutlined|CloseCircleOutlined|StopOutlined|FileOutlined)\b/u,
      );
    }

    const indexSource = await readFile(path.join(pluginRoot, "index.tsx"), "utf8");
    expect(importSpecifiers(indexSource)).toContain(
      "../../agent-ui/components/tool",
    );
    expect(indexSource).toMatch(/<AgentTool\b/u);

    const css = await readFile(path.join(pluginRoot, "styles.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(/\.ant-|development-preview|--ui-/u);
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the Agent Tool identity canonical across the generated project", async () => {
    const appUI = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui/app-ui.json"), "utf8"),
    ) as { pluginInstances?: Record<string, { pluginId?: string }> };
    const registry = await readFile(
      path.join(projectRoot, "plugins/registry.generated.ts"),
      "utf8",
    );
    const templateLibrary = await readFile(
      path.join(projectRoot, "plugins/antd-x-template-library/index.ts"),
      "utf8",
    );

    expect(appUI.pluginInstances?.["agent-tool-message-main"]?.pluginId).toBe(
      "agent-tool",
    );
    expect(registry).toContain('./agent-tool/definition');
    expect(templateLibrary).toContain("agentToolPlugin");
    expect(templateLibrary).toContain("AgentToolPlugin");
  });

  it("keeps removed Tool identities out of the generated project", async () => {
    const removedIdentities = [
      ["antd", "x", "tool", "message"].join("-"),
      ["Antd", "X", "Tool", "Message"].join(""),
      ["antd", "X", "Tool", "Message", "Plugin"].join(""),
    ];
    const oldPluginRoot = path.join(
      projectRoot,
      "plugins",
      removedIdentities[0]!,
    );
    const violations: string[] = [];

    await expect(stat(oldPluginRoot)).rejects.toMatchObject({ code: "ENOENT" });
    for (const filePath of await collectFiles(
      projectRoot,
      (candidate) => /\.(?:css|json|md|ts|tsx)$/u.test(candidate),
    )) {
      const source = await readFile(filePath, "utf8");
      if (removedIdentities.some((identity) => source.includes(identity))) {
        violations.push(path.relative(projectRoot, filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the Agent Reasoning plugin canonical and independent of Ant", async () => {
    const pluginRoot = path.join(projectRoot, "plugins/agent-reasoning");
    const manifest = JSON.parse(
      await readFile(path.join(pluginRoot, "manifest.json"), "utf8"),
    ) as { id: string; name: string; version: string };
    const sourceFiles = await collectFiles(
      pluginRoot,
      (filePath) => /\.(?:css|ts|tsx)$/u.test(filePath),
    );

    expect(manifest).toMatchObject({
      id: "agent-reasoning",
      name: "Agent Reasoning",
      version: "1.2.0",
    });
    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf8");
      expect(source, filePath).not.toMatch(
        /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-|\b(?:Think|BulbOutlined|Typography)\b/u,
      );
    }

    const indexSource = await readFile(path.join(pluginRoot, "index.tsx"), "utf8");
    expect(importSpecifiers(indexSource)).toContain(
      "../../agent-ui/components/reasoning",
    );
    expect(indexSource).toMatch(/<AgentReasoning\b/u);
  });

  it("keeps removed Reasoning identities out of the generated project", async () => {
    const removedIdentities = [
      ["antd", "x", "reasoning"].join("-"),
      ["Antd", "X", "Reasoning"].join(""),
      ["antd", "X", "Reasoning", "Plugin"].join(""),
    ];
    const oldPluginRoot = path.join(
      projectRoot,
      "plugins",
      removedIdentities[0]!,
    );
    const violations: string[] = [];

    await expect(stat(oldPluginRoot)).rejects.toMatchObject({ code: "ENOENT" });
    for (const filePath of await collectFiles(
      projectRoot,
      (candidate) => /\.(?:css|json|md|ts|tsx)$/u.test(candidate),
    )) {
      const source = await readFile(filePath, "utf8");
      if (removedIdentities.some((identity) => source.includes(identity))) {
        violations.push(path.relative(projectRoot, filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps Agent Thread presentation-only and runtime-independent", async () => {
    const threadRoot = path.join(
      registryRoot,
      "items/agent-component-thread/files/components",
    );
    const source = await readFile(path.join(threadRoot, "thread.tsx"), "utf8");
    const specifiers = importSpecifiers(source);

    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(
      /@assistant-ui\/|@base-ui\/react|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|tailwindcss|class-variance-authority|lucide-react|@radix-ui\//u,
    );
    expect(source).not.toMatch(
      /@agent-ui\/runtime-core|@agent-ui\/runtime-agui|@agent-ui\/runtime-react|(?:^|["'/])runtime\/|services\/conversations|framework\/contracts\/ui-plugin/u,
    );
    expect(source).not.toMatch(
      /\b(?:useEffect|useLayoutEffect|ResizeObserver|IntersectionObserver|MutationObserver|addEventListener|requestAnimationFrame|scrollIntoView)\b|\.scrollTo\s*\(|\.scrollTop\s*=/u,
    );
    expect(source).not.toMatch(/aria-live/u);
  });

  it("keeps Agent Thread colors tokenized and CSS isolated", async () => {
    const css = await readFile(
      path.join(
        registryRoot,
        "items/agent-component-thread/files/components/thread.module.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(
      /(?:^|\})\s*(?:body|html)\s*(?:,|\{)|\[data-agent-ui-root\]|:global|\.ant-/gmu,
    );
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the managed Agent Thread copy byte-identical to Registry source", async () => {
    for (const fileName of ["thread.tsx", "thread.module.css"]) {
      const registrySource = await readFile(
        path.join(
          registryRoot,
          "items/agent-component-thread/files/components",
          fileName,
        ),
        "utf8",
      );
      const installedSource = await readFile(
        path.join(projectRoot, "agent-ui/components", fileName),
        "utf8",
      );
      expect(installedSource).toBe(registrySource);
    }
  });

  it("keeps the canonical message list owned and bound to managed surfaces", async () => {
    const pluginRoot = path.join(projectRoot, "plugins/agent-message-list");
    const pluginFiles = await collectFiles(
      pluginRoot,
      (filePath) => /\.(?:css|json|tsx?)$/u.test(filePath),
    );
    const source = await readFile(path.join(pluginRoot, "index.tsx"), "utf8");
    const css = await readFile(path.join(pluginRoot, "styles.css"), "utf8");
    const manifest = JSON.parse(
      await readFile(path.join(pluginRoot, "manifest.json"), "utf8"),
    ) as {
      id?: string;
      version?: string;
      slots?: { children?: string[] };
    };
    const appUI = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui/app-ui.json"), "utf8"),
    ) as {
      pluginInstances?: Record<string, { pluginId?: string }>;
    };
    const registry = await readFile(
      path.join(projectRoot, "plugins/registry.generated.ts"),
      "utf8",
    );
    const templateLibrary = await readFile(
      path.join(projectRoot, "plugins/antd-x-template-library/index.ts"),
      "utf8",
    );
    const legacyIdentityPatterns = [
      new RegExp(["antd", "x-message-list"].join("-"), "u"),
      new RegExp(["AntdX", "MessageList"].join(""), "u"),
      new RegExp(["antdX", "MessageList"].join(""), "u"),
    ];

    expect(source).toContain('from "../../agent-ui/components/message"');
    expect(source).toContain('from "../../agent-ui/components/thread"');
    expect(source).toMatch(/<AgentMessage\b/u);
    expect(source).toMatch(/<AgentThread\b/u);
    expect(source).not.toMatch(
      /\bBubble(?:ItemType|ListProps)?\b|<Bubble\.List\b|bubbleRole|bubbleRoles|surfaceRole/u,
    );
    expect(source).not.toMatch(/placement:\s*["']end["']/u);
    expect(source).not.toMatch(/shape:\s*["']corner["']/u);
    expect(source).not.toMatch(/variant:\s*["']filled["']/u);
    expect(source).not.toMatch(
      /ant-bubble-dot|ant-bubble-loading|agent-message-list-role-dot/u,
    );
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(
      /ant-bubble-|bubble--surface|agent-message-list-role-dot/u,
    );
    expect(css).toMatch(
      /\.agent-message-list-text\s*\{[^}]*white-space:\s*pre-wrap;/su,
    );
    expect(css).toMatch(
      /\.agent-message-list-plugin\s*\{[^}]*overflow:\s*hidden;/su,
    );
    expect(css).toMatch(/\.agent-message-list-thread-item\s*\{/u);
    for (const filePath of pluginFiles) {
      const pluginFile = await readFile(filePath, "utf8");
      expect(pluginFile, filePath).not.toMatch(
        /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-/u,
      );
      for (const legacyIdentity of legacyIdentityPatterns) {
        expect(pluginFile, filePath).not.toMatch(legacyIdentity);
      }
    }
    expect(manifest.id).toBe("agent-message-list");
    expect(manifest.version).toBe("1.4.0");
    expect(manifest).toMatchObject({
      slots: {
        children: [
          "conversation.message.reasoning",
          "conversation.message.tool-activity",
          "conversation.message.attachments",
          "conversation.message.sources",
        ],
      },
    });
    expect(source).toContain("AttachmentFallbackRenderer");
    expect(source).toContain("SourcesFallbackRenderer");
    expect(source).toContain("ToolActivityFallbackRenderer");
    expect(source).not.toContain("LegacyToolActivityRenderer");
    expect(source).not.toContain("🔧");
    expect(
      appUI.pluginInstances?.["agent-messages-main"]?.pluginId,
    ).toBe("agent-message-list");
    expect(registry).toContain('./agent-message-list/definition');
    expect(templateLibrary).toContain("agentMessageListPlugin");
    expect(templateLibrary).toContain("AgentMessageListPlugin");
    for (const legacyIdentity of legacyIdentityPatterns) {
      expect(registry).not.toMatch(legacyIdentity);
      expect(templateLibrary).not.toMatch(legacyIdentity);
    }
  });

  it("keeps the Composer plugin implementation free of Ant Design UI", async () => {
    const composerRoot = path.join(projectRoot, "plugins/agent-composer");
    const composerFiles = await collectFiles(
      composerRoot,
      (filePath) => /\.(?:css|tsx?)$/u.test(filePath),
    );
    for (const composerPath of composerFiles) {
      const source = await readFile(composerPath, "utf8");
      expect(source, composerPath).not.toMatch(
        /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-|antd-/u,
      );
    }
    const composerCss = await readFile(path.join(composerRoot, "styles.css"), "utf8");
    expect(composerCss).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch)\s*\(/iu);
  });

  it("keeps the canonical Empty Thread Welcome and Suggestions identities bound", async () => {
    const appUI = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui/app-ui.json"), "utf8"),
    ) as {
      pluginInstances?: Record<string, {
        pluginId?: string;
        mount?: { slotId?: string };
        props?: Record<string, unknown>;
      }>;
    };
    const registry = await readFile(
      path.join(projectRoot, "plugins/registry.generated.ts"),
      "utf8",
    );
    const templateLibrary = await readFile(
      path.join(projectRoot, "plugins/antd-x-template-library/index.ts"),
      "utf8",
    );
    const surfaceManifest = JSON.parse(
      await readFile(
        path.join(projectRoot, "plugins/conversation-surface/manifest.json"),
        "utf8",
      ),
    ) as { version?: string; slots?: { children?: readonly string[] } };

    expect(appUI.pluginInstances?.["agent-welcome-main"]).toMatchObject({
      pluginId: "agent-thread-welcome",
      mount: { slotId: "conversation.empty.welcome" },
      props: {
        title: "Agent Frontend",
        description:
          "通过 AG-UI 与一个 Agent Runtime 连接，由可复用 UI Plugin 确定性渲染。",
      },
    });
    expect(appUI.pluginInstances?.["agent-prompts-main"]).toMatchObject({
      pluginId: "agent-suggestions",
      mount: { slotId: "conversation.empty.suggestions" },
      props: {
        title: "你可以这样开始",
        items: [
          {
            key: "summarize",
            label: "总结当前上下文",
            description: "提炼目标、约束与下一步",
          },
          {
            key: "explain",
            label: "解释界面结构",
            description: "说明 AppUIModel 与插件的关系",
          },
          {
            key: "next",
            label: "建议下一步",
            description: "给出一个可执行的后续动作",
          },
        ],
      },
    });
    expect(surfaceManifest.version).toBe("2.0.0");
    expect(surfaceManifest.slots?.children).toEqual([
      "conversation.empty.welcome",
      "conversation.empty.suggestions",
      "conversation.timeline",
      "conversation.composer",
    ]);
    expect(registry).toContain('./agent-thread-welcome/definition');
    expect(registry).toContain('./agent-suggestions/definition');
    expect(templateLibrary).toContain("agentThreadWelcomePlugin");
    expect(templateLibrary).toContain("AgentThreadWelcomePlugin");
    expect(templateLibrary).toContain("agentSuggestionsPlugin");
    expect(templateLibrary).toContain("AgentSuggestionsPlugin");
  });

  it("keeps the canonical Empty Thread plugins independent of Ant", async () => {
    for (const pluginDirectory of [
      "agent-thread-welcome",
      "agent-suggestions",
    ]) {
      const pluginRoot = path.join(projectRoot, "plugins", pluginDirectory);
      const sourceFiles = await collectFiles(
        pluginRoot,
        (filePath) => /\.(?:css|json|ts|tsx)$/u.test(filePath),
      );
      expect(sourceFiles.length).toBeGreaterThan(0);
      for (const filePath of sourceFiles) {
        const source = await readFile(filePath, "utf8");
        expect(source, filePath).not.toMatch(
          /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-/u,
        );
      }
      const css = await readFile(path.join(pluginRoot, "styles.css"), "utf8");
      expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
      expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
      expect(css).not.toMatch(/\.ant-|development-preview|--ui-/u);
      expect(css).toMatch(/var\(--aui-/u);
    }
  });

  it("keeps the removed Ant Welcome and Prompts identities out of the generated project", async () => {
    const hyphenated = [
      ["antd", "x", "welcome"].join("-"),
      ["antd", "x", "prompts"].join("-"),
    ];
    const pascal = [
      ["Antd", "X", "Welcome"].join(""),
      ["Antd", "X", "Prompts"].join(""),
    ];
    const camel = [
      ["antd", "X", "Welcome"].join(""),
      ["antd", "X", "Prompts"].join(""),
    ];
    const removedIdentities = [...hyphenated, ...pascal, ...camel];
    const violations: string[] = [];

    for (const pluginDirectory of hyphenated) {
      await expect(
        stat(path.join(projectRoot, "plugins", pluginDirectory)),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
    for (const filePath of await collectFiles(
      projectRoot,
      (candidate) => /\.(?:css|json|md|ts|tsx)$/u.test(candidate),
    )) {
      const relative = path.relative(projectRoot, filePath);
      if (relative.split(path.sep).includes(".agentuicreator")) continue;
      const source = await readFile(filePath, "utf8");
      if (removedIdentities.some((identity) => source.includes(identity))) {
        violations.push(relative);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the Empty Thread Slots out of the removed conversation.empty contract", async () => {
    const surfaceIndex = await readFile(
      path.join(projectRoot, "plugins/conversation-surface/index.tsx"),
      "utf8",
    );
    expect(surfaceIndex).not.toContain('renderSlot("conversation.empty")');
    expect(surfaceIndex).toContain('renderSlot("conversation.empty.welcome")');
    expect(surfaceIndex).toContain('renderSlot("conversation.empty.suggestions")');
    expect(surfaceIndex).toContain('data-slot="conversation-empty-welcome"');
    expect(surfaceIndex).toContain('data-slot="conversation-empty-suggestions"');
  });

  it("keeps Agent Thread Welcome presentation-only and runtime-independent", async () => {
    const welcomeRoot = path.join(
      registryRoot,
      "items/agent-component-thread-welcome/files/components",
    );
    const source = await readFile(
      path.join(welcomeRoot, "thread-welcome.tsx"),
      "utf8",
    );
    const specifiers = importSpecifiers(source);

    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(
      /@assistant-ui(?:\/|$)|@base-ui\/react|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|tailwindcss|class-variance-authority|lucide-react|@radix-ui\//u,
    );
    expect(source).not.toMatch(
      /@agent-ui\/runtime-core|@agent-ui\/runtime-agui|@agent-ui\/runtime-react|(?:^|["'/])runtime\/|services\/|framework\/contracts\//u,
    );
    expect(source).not.toMatch(
      /\b(?:useAgent\w*|usePlugin\w*|AgentRun|AG-UI|PluginInstance|AppUIModel|sendMessage|interrupts?|runStatus)\b/u,
    );
  });

  it("keeps Agent Thread Welcome colors tokenized and CSS isolated", async () => {
    const css = await readFile(
      path.join(
        registryRoot,
        "items/agent-component-thread-welcome/files/components/thread-welcome.module.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(
      /(?:^|\})\s*(?:body|html)\s*(?:,|\{)|\[data-agent-ui-root\]|:global|\.ant-|development-preview|--ui-/gmu,
    );
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the managed Agent Thread Welcome copy byte-identical to Registry source", async () => {
    for (const fileName of ["thread-welcome.tsx", "thread-welcome.module.css"]) {
      const registrySource = await readFile(
        path.join(
          registryRoot,
          "items/agent-component-thread-welcome/files/components",
          fileName,
        ),
        "utf8",
      );
      const installedSource = await readFile(
        path.join(projectRoot, "agent-ui/components", fileName),
        "utf8",
      );
      expect(installedSource).toBe(registrySource);
    }
  });

  it("keeps Agent Suggestions presentation-only and runtime-independent", async () => {
    const suggestionsRoot = path.join(
      registryRoot,
      "items/agent-component-suggestions/files/components",
    );
    const source = await readFile(
      path.join(suggestionsRoot, "suggestions.tsx"),
      "utf8",
    );
    const specifiers = importSpecifiers(source);

    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(
      /@assistant-ui(?:\/|$)|@base-ui\/react|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|tailwindcss|class-variance-authority|lucide-react|@radix-ui\//u,
    );
    expect(source).not.toMatch(
      /@agent-ui\/runtime-core|@agent-ui\/runtime-agui|@agent-ui\/runtime-react|(?:^|["'/])runtime\/|services\/|framework\/contracts\//u,
    );
    expect(source).not.toMatch(
      /\b(?:useAgentRun|useAgentInterrupts|usePluginActions|usePluginInstance|sendMessage|prompt|PluginInstance|AG-UI|runStatus|interrupts?)\b/u,
    );
  });

  it("keeps Agent Suggestions colors tokenized and CSS isolated", async () => {
    const css = await readFile(
      path.join(
        registryRoot,
        "items/agent-component-suggestions/files/components/suggestions.module.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(
      /(?:^|\})\s*(?:body|html)\s*(?:,|\{)|\[data-agent-ui-root\]|:global|\.ant-|development-preview|--ui-/gmu,
    );
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("keeps the managed Agent Suggestions copy byte-identical to Registry source", async () => {
    for (const fileName of ["suggestions.tsx", "suggestions.module.css"]) {
      const registrySource = await readFile(
        path.join(
          registryRoot,
          "items/agent-component-suggestions/files/components",
          fileName,
        ),
        "utf8",
      );
      const installedSource = await readFile(
        path.join(projectRoot, "agent-ui/components", fileName),
        "utf8",
      );
      expect(installedSource).toBe(registrySource);
    }
  });
});
