import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(projectRoot, "../..");
const registrySourceRoot = path.join(
  repositoryRoot,
  "packages/source-registry/registry/items/agent-component-conversation-list/files/components",
);

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/gu)].map((match) => match[1]!);
}

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(filePath));
    } else {
      files.push(filePath);
    }
  }
  return files;
}

describe("canonical conversation navigation policy", () => {
  it("keeps AgentConversationList presentational and Runtime-independent", async () => {
    const source = await readFile(
      path.join(registrySourceRoot, "conversation-list.tsx"),
      "utf8",
    );
    const specifiers = importSpecifiers(source);

    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(
      /@assistant-ui\/|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-|@agent-ui\/runtime-|services\/conversations|framework\/contracts|ConversationSnapshot|ConversationSummary|AgentUIConversationService|\buseAgent\w*\b|\busePlugin\w*\b/u,
    );
    expect(source).toMatch(/<button\b/u);
    expect(source).toContain('type="button"');
    expect(source).toContain('aria-current={active ? "page" : undefined}');
    expect(source).toContain("data-active={active || undefined}");
  });

  it("keeps conversation list colors tokenized and CSS isolated", async () => {
    const css = await readFile(
      path.join(registrySourceRoot, "conversation-list.module.css"),
      "utf8",
    );

    expect(css).toMatch(/var\(--aui-/u);
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/\.ant-|:global|development-preview|--ui-/u);
  });

  it("keeps installed conversation list files byte-identical to Registry source", async () => {
    for (const fileName of ["conversation-list.tsx", "conversation-list.module.css"]) {
      expect(
        await readFile(path.join(projectRoot, "agent-ui/components", fileName), "utf8"),
      ).toBe(await readFile(path.join(registrySourceRoot, fileName), "utf8"));
    }
  });

  it("keeps navigation as an Ant-free Conversation Service consumer", async () => {
    const root = path.join(projectRoot, "plugins/agent-conversations");
    const files = await collectFiles(root);
    const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
    const definition = sources[files.findIndex((file) => file.endsWith("definition.ts"))]!;
    const component = sources[files.findIndex((file) => file.endsWith("index.tsx"))]!;
    const manifest = JSON.parse(
      await readFile(path.join(root, "manifest.json"), "utf8"),
    ) as { id?: string; version?: string; capabilities?: string[] };

    expect(manifest).toMatchObject({
      id: "agent-conversations",
      version: "1.0.0",
    });
    expect(manifest.capabilities).not.toContain("plugin-service-provider");
    expect(definition).toContain("inject: [AGENT_UI_CONVERSATION_SERVICE]");
    expect(definition).not.toMatch(/provides\s*:/u);
    expect(component).toContain('from "../../agent-ui/components/conversation-list"');
    expect(component).toMatch(/<AgentConversationList\b/u);
    expect(component).toContain('data-ui-plugin="agent-conversations"');
    expect(component).not.toMatch(/AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE|createConversationController/u);
    expect(sources.join("\n")).not.toMatch(
      /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-/u,
    );
  });

  it("keeps the controller headless and solely responsible for Conversation Service", async () => {
    const root = path.join(projectRoot, "plugins/conversation-controller");
    const definition = await readFile(path.join(root, "definition.ts"), "utf8");
    const component = await readFile(path.join(root, "index.tsx"), "utf8");
    const manifest = JSON.parse(
      await readFile(path.join(root, "manifest.json"), "utf8"),
    ) as { id?: string; version?: string; capabilities?: string[] };

    expect(manifest).toMatchObject({
      id: "conversation-controller",
      version: "1.0.0",
    });
    expect(manifest.capabilities).toContain("headless");
    expect(definition).toContain("inject: [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE]");
    expect(definition).toContain("provides: [AGENT_UI_CONVERSATION_SERVICE]");
    expect(definition).toContain("createConversationController");
    expect(definition).toContain("controller.dispose()");
    expect(component).toMatch(/ConversationControllerPlugin\(\)\s*\{\s*return null;/su);
    expect(`${definition}\n${component}`).not.toMatch(
      /AgentConversationList|@ant-design\/x|@ant-design\/icons|from\s*["']antd["']/u,
    );
  });

  it("binds canonical identities and removes the obsolete identity everywhere in the generated project", async () => {
    const appUI = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui/app-ui.json"), "utf8"),
    ) as { pluginInstances?: Record<string, { pluginId?: string; mount?: { slotId?: string } }> };
    const registry = await readFile(
      path.join(projectRoot, "plugins/registry.generated.ts"),
      "utf8",
    );
    const template = await readFile(
      path.join(projectRoot, "plugins/antd-x-template-library/index.ts"),
      "utf8",
    );
    const legacyPatterns = [
      new RegExp(["antd", "x-conversations"].join("-"), "u"),
      new RegExp(["AntdX", "Conversations"].join(""), "u"),
      new RegExp(["antdX", "Conversations"].join(""), "u"),
    ];

    expect(appUI.pluginInstances?.["agent-conversation-controller-main"]).toMatchObject({
      pluginId: "conversation-controller",
    });
    expect(appUI.pluginInstances?.["agent-conversation-controller-main"]?.mount)
      .toBeUndefined();
    expect(appUI.pluginInstances?.["agent-conversations-main"]).toMatchObject({
      pluginId: "agent-conversations",
      mount: { slotId: "agent-conversations" },
    });
    expect(registry).toContain('./agent-conversations/definition');
    expect(registry).toContain('./conversation-controller/definition');
    expect(template).toContain("agentConversationsPlugin");
    expect(template).toContain("AgentConversationsPlugin");
    expect(template).toContain("conversationControllerPlugin");
    expect(template).toContain("ConversationControllerPlugin");

    const projectSources = await Promise.all(
      (await collectFiles(projectRoot))
        .filter((file) => /\.(?:css|json|md|tsx?)$/u.test(file))
        .map((file) => readFile(file, "utf8")),
    );
    for (const pattern of legacyPatterns) {
      expect(projectSources.join("\n")).not.toMatch(pattern);
    }
  });
});
