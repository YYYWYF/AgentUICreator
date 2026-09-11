import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(projectRoot, "../..");
const registryRoot = path.join(workspaceRoot, "packages/source-registry/registry");

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
  it("keeps assistant-ui out of generated and Registry imports", async () => {
    const sourceFiles = [
      ...await collectFiles(path.join(projectRoot, "agent-ui"), (filePath) => /\.[cm]?[jt]sx?$/u.test(filePath)),
      ...await collectFiles(registryRoot, (filePath) => /\.[cm]?[jt]sx?$/u.test(filePath)),
    ];
    for (const filePath of sourceFiles) {
      for (const specifier of importSpecifiers(await readFile(filePath, "utf8"))) {
        expect(specifier, filePath).not.toMatch(/^@?assistant-ui(?:\/|$)/u);
      }
    }
  });

  it("keeps forbidden Agent Component dependencies out of package manifests", async () => {
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
          expect(dependency, filePath).not.toMatch(/^@?assistant-ui(?:\/|$)/u);
          expect(dependency, filePath).not.toBe("tailwindcss");
          expect(dependency, filePath).not.toBe("class-variance-authority");
          expect(dependency, filePath).not.toBe("lucide-react");
          expect(dependency, filePath).not.toMatch(/^@radix-ui\//u);
        }
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
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
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
    ) as { id?: string; version?: string };
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
    expect(manifest.version).toBe("1.3.0");
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
});
