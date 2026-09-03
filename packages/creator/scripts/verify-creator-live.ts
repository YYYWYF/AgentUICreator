import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCreatorAgent,
  createCreatorChatModel,
  loadCreatorModelConfig,
} from "../src/index.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workspaceRoot = path.resolve(packageRoot, "../..");
const frontendRoot = path.join(workspaceRoot, "examples/agent-frontend");

async function createFixtureProject(): Promise<string> {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "agent-ui-creator-live-"),
  );
  await mkdir(path.join(projectRoot, "app-ui"), { recursive: true });
  await mkdir(path.join(projectRoot, "plugins"), { recursive: true });
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  await cp(
    path.join(frontendRoot, "framework", "contracts"),
    path.join(projectRoot, "framework", "contracts"),
    { recursive: true },
  );
  await cp(
    path.join(frontendRoot, "plugins", "chat"),
    path.join(projectRoot, "plugins", "chat"),
    { recursive: true },
  );
  await symlink(
    path.join(workspaceRoot, "node_modules"),
    path.join(projectRoot, "node_modules"),
    "dir",
  );

  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    `${JSON.stringify(
      {
        version: "2",
        root: {
          type: "slot",
          id: "chat-slot-node",
          slotId: "chat",
        },
        slots: {
          chat: {
            id: "chat",
            kind: "single",
            scope: "thread-maybe",
            description: "Primary chat fixture",
            owner: { type: "layout", nodeId: "chat-slot-node" },
            occupants: [{ instanceId: "chat-main" }],
          },
        },
        pluginInstances: {
          "chat-main": {
            id: "chat-main",
            pluginId: "chat",
            enabled: true,
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(projectRoot, "plugins", "index.ts"),
    `import { chatPlugin } from "./chat/definition";

export const pluginDefinitions = [chatPlugin] as const;

export { chatPlugin };
export { ChatPlugin } from "./chat";
`,
  );
  await writeFile(
    path.join(projectRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "agent-ui-creator-live-fixture",
        private: true,
        type: "module",
        scripts: {
          test: "node scripts/validate-plugin.mjs",
          typecheck: "tsc --noEmit",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(projectRoot, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          types: ["node"],
          strict: true,
          noEmit: true,
          isolatedModules: true,
          verbatimModuleSyntax: true,
          resolveJsonModule: true,
          exactOptionalPropertyTypes: true,
          noUncheckedIndexedAccess: true,
          skipLibCheck: true,
        },
        include: ["framework/**/*.ts", "plugins/**/*.ts", "plugins/**/*.tsx"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(projectRoot, "scripts", "validate-plugin.mjs"),
    `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const model = JSON.parse(await readFile(new URL("../app-ui/app-ui.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../plugins/tool-call-details/manifest.json", import.meta.url), "utf8"));
const source = await readFile(new URL("../plugins/tool-call-details/index.tsx", import.meta.url), "utf8");
const definition = await readFile(new URL("../plugins/tool-call-details/definition.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../plugins/tool-call-details/styles.css", import.meta.url), "utf8");
const registry = await readFile(new URL("../plugins/index.ts", import.meta.url), "utf8");

assert.equal(manifest.id, "tool-call-details");
assert.equal(manifest.data?.messages, true);
assert.match(source, /context\\.messages/);
assert.match(source, /tool/i);
assert.match(source, /\\.\\/styles\\.css/);
assert.match(definition, /UIPluginDefinition/);
assert.match(definition, /parseUIPluginManifest/);
assert.ok(styles.trim().length > 0, "Plugin styles must not be empty");
assert.match(registry, /toolCallDetailsPlugin/);

const pluginInstance = Object.values(model.pluginInstances).find((instance) => instance.pluginId === "tool-call-details" && instance.enabled);
assert.ok(pluginInstance, "Missing enabled tool-call-details PluginInstance");
assert.equal(model.root.type, "row");
assert.ok(model.root.children.length >= 2, "The layout must keep chat and add a tool-call details region");
const rightRegion = model.root.children.at(-1);
assert.equal(rightRegion?.type, "panel");
assert.equal(rightRegion.child?.type, "slot");
const rightSlot = model.slots[rightRegion.child.slotId];
assert.ok(rightSlot?.occupants.some((occupant) => occupant.instanceId === pluginInstance.id), "The right semantic Slot must mount the tool-call-details instance");
assert.ok(model.slots.chat.occupants.some((occupant) => occupant.instanceId === "chat-main"), "The existing chat instance must remain mounted");
console.log("UI Plugin and AppUIModel validation passed");
`,
  );

  return projectRoot;
}

interface RecordedToolCall {
  name?: unknown;
  args?: unknown;
}

function summarizeToolCall(call: RecordedToolCall): string {
  const name = typeof call.name === "string" ? call.name : "unknown";
  if (typeof call.args !== "object" || call.args === null) {
    return name;
  }

  const args = call.args as Record<string, unknown>;
  if (name === "task") {
    const subagentType =
      typeof args.subagent_type === "string" ? args.subagent_type : "unknown";
    const description =
      typeof args.description === "string"
        ? args.description.replaceAll(/\s+/gu, " ").slice(0, 240)
        : "missing description";
    return `${name}(${subagentType}: ${description})`;
  }

  const target = [args.file_path, args.path, args.command].find(
    (value): value is string => typeof value === "string",
  );
  return target === undefined ? name : `${name}(${target})`;
}

async function main(): Promise<void> {
  const modelConfig = loadCreatorModelConfig({ configRoot: workspaceRoot });
  const modelName = modelConfig.modelName;
  const projectRoot = await createFixtureProject();

  try {
    const model = createCreatorChatModel(modelConfig);
    const agent = createCreatorAgent({ model, projectRoot });
    const result = await agent.invoke(
      {
        messages: [
          {
            role: "user",
            content:
              "增加一个工具调用详情面板。项目里没有现成实现，请创建 id 为 tool-call-details 的 UI Plugin，按照现有 Plugin 约定读取 AG-UI messages，并把它放到聊天区域右侧。完成后运行 pnpm typecheck 和 pnpm test；两项通过前不要结束。",
          },
        ],
      },
      { recursionLimit: 96 },
    );

    const toolCalls: RecordedToolCall[] = [];
    for (const message of result.messages) {
      const calls = (message as { tool_calls?: unknown }).tool_calls;
      if (Array.isArray(calls)) {
        toolCalls.push(...(calls as RecordedToolCall[]));
      }
    }
    console.log(
      `Creator tool-call trace: ${toolCalls.map(summarizeToolCall).join(" -> ") || "none"}`,
    );
    for (const message of result.messages) {
      const taskResult = message as { content?: unknown; name?: unknown };
      if (taskResult.name === "task") {
        const content =
          typeof taskResult.content === "string"
            ? taskResult.content.replaceAll(/\s+/gu, " ").slice(0, 1_000)
            : JSON.stringify(taskResult.content).slice(0, 1_000);
        console.log(`Creator task result: ${content}`);
      }
    }
    const lastAssistantMessage = [...result.messages]
      .reverse()
      .find((message) => (message as { _getType?: () => string })._getType?.() === "ai") as
      | {
          content?: unknown;
          response_metadata?: unknown;
          tool_calls?: unknown;
        }
      | undefined;
    if (lastAssistantMessage !== undefined) {
      const content =
        typeof lastAssistantMessage.content === "string"
          ? lastAssistantMessage.content.replaceAll(/\s+/gu, " ").slice(0, 1_000)
          : JSON.stringify(lastAssistantMessage.content).slice(0, 1_000);
      console.log(`Creator final assistant content: ${content || "<empty>"}`);
      console.log(
        `Creator final response metadata: ${JSON.stringify(lastAssistantMessage.response_metadata)}`,
      );
      const finishReason = (
        lastAssistantMessage.response_metadata as
          | { finish_reason?: unknown }
          | undefined
      )?.finish_reason;
      assert(
        !(
          finishReason === "tool_calls" &&
          (!Array.isArray(lastAssistantMessage.tool_calls) ||
            lastAssistantMessage.tool_calls.length === 0) &&
          typeof lastAssistantMessage.content === "string" &&
          lastAssistantMessage.content.includes("<tool_call>")
        ),
        "The configured OpenAI-compatible endpoint returned tool calls as assistant text instead of a structured tool_calls array. Use a model endpoint with OpenAI-compatible tool calling; provider-specific protocol parsing is outside the Phase 8 Creator boundary.",
      );
    }

    const expectedPluginSource = path.join(
      projectRoot,
      "plugins",
      "tool-call-details",
      "index.tsx",
    );
    assert(
      existsSync(expectedPluginSource),
      "Creator did not create plugins/tool-call-details/index.tsx. See the tool-call trace above.",
    );

    const manifest = JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          "plugins",
          "tool-call-details",
          "manifest.json",
        ),
        "utf8",
      ),
    ) as { id?: unknown; data?: { messages?: unknown } };
    assert.equal(manifest.id, "tool-call-details");
    assert.equal(manifest.data?.messages, true);
    const pluginSource = await readFile(
      expectedPluginSource,
      "utf8",
    );
    assert.match(pluginSource, /context\.messages/);
    assert.match(pluginSource, /tool/i);

    const updatedModel = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ) as {
      root: {
        type: unknown;
        children?: Array<{
          type?: unknown;
          child?: { type?: unknown; slotId?: unknown };
        }>;
      };
      slots: Record<
        string,
        { occupants?: Array<{ instanceId?: unknown }> }
      >;
      pluginInstances: Record<
        string,
        { id: string; pluginId: string; enabled: boolean }
      >;
    };
    const pluginInstance = Object.values(updatedModel.pluginInstances).find(
      (instance) =>
        instance.pluginId === "tool-call-details" && instance.enabled,
    );
    assert(
      pluginInstance,
      "Creator did not add a tool-call-details PluginInstance.",
    );
    assert.equal(updatedModel.root.type, "row");
    const rightRegion = updatedModel.root.children?.at(-1);
    assert.equal(rightRegion?.type, "panel");
    assert.equal(rightRegion.child?.type, "slot");
    const rightSlotId = rightRegion.child?.slotId;
    const rightSlot =
      typeof rightSlotId === "string" ? updatedModel.slots[rightSlotId] : undefined;
    assert(
      rightSlot?.occupants?.some(
        (occupant) => occupant.instanceId === pluginInstance.id,
      ) === true,
      "Creator did not mount the tool-call-details instance in the right Slot.",
    );

    assert(
      toolCalls.some(
        (call) => call.name === "edit_file" || call.name === "write_file",
      ),
      "Creator did not use an AppUIModel write tool.",
    );
    assert(
      toolCalls.some(
        (call) =>
          call.name === "read_file" &&
          typeof call.args === "object" &&
          call.args !== null &&
          "file_path" in call.args &&
          typeof call.args.file_path === "string" &&
          call.args.file_path.startsWith("/skills/"),
      ),
      "Creator did not load a relevant Creator Skill.",
    );
    assert(
      toolCalls.some(
        (call) =>
          typeof call.args === "object" &&
          call.args !== null &&
          JSON.stringify(call.args).includes(
            "/project/plugins/tool-call-details/",
          ),
      ),
      "Creator did not create the tool-call-details Plugin files.",
    );
    assert(
      toolCalls.some(
        (call) =>
          call.name === "execute" &&
          typeof call.args === "object" &&
          call.args !== null &&
          "command" in call.args &&
          call.args.command === "pnpm typecheck",
      ),
      "Creator did not run pnpm typecheck.",
    );
    assert(
      toolCalls.some(
        (call) =>
          call.name === "execute" &&
          typeof call.args === "object" &&
          call.args !== null &&
          "command" in call.args &&
          call.args.command === "pnpm test",
      ),
      "Creator did not run pnpm test.",
    );

    console.log(
      `Creator live verification passed with ${modelName}; Skill loading, UI Plugin creation, AG-UI message consumption, AppUIModel composition, typecheck, and tests were all observed.`,
    );
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
}

await main();
