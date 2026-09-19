// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ConversationRuntimeProvider,
  type ConversationAgentFactory,
} from "@agent-ui/runtime-conversation";
import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { ConversationSuggestionsPlugin } from "../plugins/conversation-suggestions";
import {
  capabilityCatalogRevision,
  pluginCapabilityCatalog,
} from "../plugins";
import { createConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import { platformMode } from "../framework/modes/platform";
import { AgentRuntimeProvider } from "../runtime/context";
import {
  buildRuntimeComposition,
  type RuntimeCompositionBuildResult,
} from "../runtime/composition";
import {
  UIPluginRuntime,
  type UIPluginRuntimeActions,
} from "../runtime/plugins";
import { createStaticAgentRuntime } from "./agent-runtime-fixture";
import { mutateAppUIModel } from "../scripts/ui-project/app-ui-transaction";
import {
  buildCreatorActionCatalog,
} from "../scripts/ui-project/creator-action-catalog";
import {
  collectPluginProjectFacts,
  generatePluginRegistryFromFacts,
} from "../scripts/ui-project/registry-generator";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const mountedRoots: Root[] = [];
const temporaryProjects: string[] = [];
const fixtureConfig: UIProjectControlConfig = {
  catalogs: [],
  uiPackages: [],
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};

const hash = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

const productizedModel: AppUIModel = {
  applicationPlugins: [
    {
      id: "agent-conversation-data-source-main",
      pluginId: "conversation-data-source",
      enabled: true,
    },
    {
      id: "agent-conversation-service-main",
      pluginId: "conversation-service",
      enabled: true,
    },
    {
      id: "theme-provider-main",
      pluginId: "theme-provider",
      enabled: true,
    },
  ],
  root: {
    type: "slot",
    plugins: [{
      id: "agent-conversation-surface-main",
      pluginId: "conversation-surface",
      enabled: true,
      slots: {
        emptySuggestions: [{
          id: "conversation-suggestions-main",
          pluginId: "conversation-suggestions",
          enabled: true,
        }],
      },
    }],
  },
};

const fixtureServiceContracts: Record<string, {
  provides: readonly string[];
  inject: readonly string[];
  optionalInject?: readonly string[];
}> = {
  "conversation-data-source": {
    provides: ["agent-ui.conversation-data-source"],
    inject: [],
  },
  "conversation-service": {
    provides: ["agent-ui.conversations"],
    inject: ["agent-ui.conversation-data-source"],
  },
  "theme-provider": {
    provides: ["agent-ui.theme"],
    inject: [],
  },
  "conversation-surface": {
    provides: [],
    inject: ["agent-ui.conversations"],
    optionalInject: ["agent-ui.theme"],
  },
  "conversation-suggestions": {
    provides: [],
    inject: [],
  },
};

async function createProductizedFixtureProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "assistant-ui-suggestions-runtime-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins"));
  await writeFile(
    path.join(projectRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext" },
      include: ["plugins/**/*.ts"],
    }),
  );

  for (const pluginId of Object.keys(fixtureServiceContracts)) {
    const capability = pluginCapabilityCatalog.get(pluginId);
    const contract = fixtureServiceContracts[pluginId];
    if (capability === undefined || contract === undefined) {
      throw new Error(`Missing fixture capability ${pluginId}`);
    }
    const pluginRoot = path.join(projectRoot, "plugins", pluginId);
    await mkdir(pluginRoot, { recursive: true });
    await writeFile(
      path.join(pluginRoot, "manifest.json"),
      JSON.stringify(capability.manifest),
    );
    const renderSlots = pluginId === "conversation-surface"
      ? ["emptyWelcome", "emptySuggestions", "headerActions"]
      : [];
    const renderSource = renderSlots
      .map((slot) => `renderSlot(${JSON.stringify(slot)});`)
      .join(" ");
    await writeFile(
      path.join(pluginRoot, "definition.ts"),
      [
        "const definition = {",
        "  manifest: {},",
        `  provides: ${JSON.stringify(contract.provides)},`,
        `  inject: ${JSON.stringify(contract.inject)},`,
        `  optionalInject: ${JSON.stringify(contract.optionalInject ?? [])},`,
        `  Component: ({ renderSlot }) => { ${renderSource} return null; },`,
        "};",
        "export default definition;",
        "",
      ].join("\n"),
    );
  }
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    `${JSON.stringify(productizedModel, null, 2)}\n`,
  );
  return projectRoot;
}

async function buildProductizedCatalog(
  projectRoot: string,
  model: AppUIModel,
  appUIModelSource: string,
) {
  const projectFacts = await collectPluginProjectFacts(projectRoot, fixtureConfig);
  const generation = generatePluginRegistryFromFacts(model, projectFacts);
  const catalog = await buildCreatorActionCatalog({
    model,
    generation,
    projectFacts,
    appUIModelHash: hash(appUIModelSource),
    workspacePolicy: platformMode.workspace,
  });
  return { catalog };
}

function createAgent(): ReturnType<ConversationAgentFactory> {
  return {
    threadId: "suggestions-runtime",
    runAgent: vi.fn(),
    abortRun: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  } as never;
}

function SuggestionRuntimeSurface({
  onRuntime,
  showSuggestions = true,
}: {
  onRuntime: (runtime: AssistantRuntime) => void;
  showSuggestions?: boolean;
}) {
  const aui = useAui();
  const runtime = aui.threads.__internal_getAssistantRuntime?.();
  if (runtime === undefined) {
    throw new Error("assistant-ui Runtime was not created");
  }
  onRuntime(runtime);
  return showSuggestions ? <ConversationSuggestionsPlugin renderSlot={() => null} /> : null;
}

function AssistantRuntimeProbe({
  onRuntime,
}: {
  onRuntime: (runtime: AssistantRuntime) => void;
}) {
  const aui = useAui();
  const runtime = aui.threads.__internal_getAssistantRuntime?.();
  if (runtime === undefined) {
    throw new Error("assistant-ui Runtime was not created");
  }
  onRuntime(runtime);
  return null;
}

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount());
  }
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("Conversation Suggestions Runtime integration", () => {
  it("renders configured suggestions and keeps Trigger behavior in assistant-ui", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    const binding = createConversationServiceThreadBinding();
    const agent = createAgent();
    let runtime: AssistantRuntime | undefined;

    await act(async () => {
      root.render(
        <ConversationRuntimeProvider
          endpoint="http://example.test/agent"
          threadBinding={binding}
          suggestions={[
            { title: "A", label: "A label", prompt: "Prompt A" },
            { title: "B", label: "B label", prompt: "Prompt B" },
            { title: "C", label: "C label", prompt: "Prompt C" },
          ]}
          unstable_agentFactory={() => agent}
        >
          <SuggestionRuntimeSurface onRuntime={(next) => { runtime = next; }} />
        </ConversationRuntimeProvider>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("A");
    expect(container.textContent).toContain("B");
    expect(container.textContent).toContain("C");
    const triggers = container.querySelectorAll("button.conversation-suggestion");
    expect(triggers).toHaveLength(3);

    await act(async () => {
      (triggers[0] as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(runtime?.thread.getState().messages[0]?.content).toEqual([
      { type: "text", text: "Prompt A" },
    ]);
  });

  it("completes the Suggestions remove-to-add runtime roundtrip", async () => {
    const projectRoot = await createProductizedFixtureProject();
    const initialSource = await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    );
    const initialCatalog = await buildProductizedCatalog(
      projectRoot,
      productizedModel,
      initialSource,
    );
    const remove = initialCatalog.catalog.candidates.find((candidate) =>
      candidate.kind === "remove_plugin" &&
      candidate.target.pluginId === "conversation-suggestions" &&
      candidate.status === "ready",
    );
    if (remove === undefined) throw new Error("Expected productized Suggestions Remove Action");

    const removed = await mutateAppUIModel(projectRoot, {
      appUIModelHash: hash(initialSource),
      operations: [{ type: "execute_creator_action", actionId: remove.actionId }],
    });
    const absentSource = await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    );
    const absentModel = JSON.parse(absentSource) as AppUIModel;
    const afterRemoveCatalog = await buildProductizedCatalog(
      projectRoot,
      absentModel,
      absentSource,
    );
    const add = afterRemoveCatalog.catalog.candidates.find((candidate) =>
      candidate.kind === "add_existing_plugin" &&
      candidate.target.pluginId === "conversation-suggestions" &&
      candidate.status === "ready",
    );
    if (add === undefined) throw new Error("Expected productized Suggestions Add Action");

    const restored = await mutateAppUIModel(projectRoot, {
      appUIModelHash: removed.appUIModel.afterHash,
      operations: [{ type: "execute_creator_action", actionId: add.actionId }],
    });
    expect(restored.semanticComposition?.expectedPlacement).toEqual({
      type: "plugin_slot",
      instanceId: "conversation-suggestions-main",
      parentInstanceId: "agent-conversation-surface-main",
      slot: "emptySuggestions",
    });

    const restoredSource = await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    );
    const initialComposition = await buildRuntimeComposition({
      appUIModelSource: initialSource,
      capabilityCatalog: pluginCapabilityCatalog,
      capabilityCatalogRevision,
    });
    const absentComposition = await buildRuntimeComposition({
      appUIModelSource: absentSource,
      capabilityCatalog: pluginCapabilityCatalog,
      capabilityCatalogRevision,
    });
    const restoredComposition = await buildRuntimeComposition({
      appUIModelSource: restoredSource,
      capabilityCatalog: pluginCapabilityCatalog,
      capabilityCatalogRevision,
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    const binding = createConversationServiceThreadBinding();
    const agent = createAgent();
    const suggestions = [
      { title: "A", label: "A label", prompt: "Prompt A" },
      { title: "B", label: "B label", prompt: "Prompt B" },
      { title: "C", label: "C label", prompt: "Prompt C" },
    ];
    const pluginRuntime = createStaticAgentRuntime({
      conversation: { id: "suggestions-productized-roundtrip" },
      messages: [],
      state: null,
      run: { status: "idle" },
      executions: [],
      interrupts: [],
    });
    const actions: UIPluginRuntimeActions = {
      sendMessage: vi.fn(async () => undefined),
      resumeInterrupts: vi.fn(async () => undefined),
      startNewConversation: vi.fn(async () => undefined),
      abortRun: vi.fn(),
    };
    let assistantRuntime: AssistantRuntime | undefined;

    const render = async (
      composition: RuntimeCompositionBuildResult,
    ) => {
      await act(async () => {
        root.render(
          <ConversationRuntimeProvider
            endpoint="http://example.test/agent"
            threadBinding={binding}
            suggestions={suggestions}
            unstable_agentFactory={() => agent}
          >
            <AgentRuntimeProvider runtime={pluginRuntime}>
              <AssistantRuntimeProbe onRuntime={(runtime) => {
                assistantRuntime = runtime;
              }} />
              <UIPluginRuntime
                actions={actions}
                model={composition.runtimeModel}
                registry={composition.activeRegistry}
              />
            </AgentRuntimeProvider>
          </ConversationRuntimeProvider>,
        );
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    await render(initialComposition);
    expect(container.textContent).toContain("A");
    expect(container.textContent).toContain("B");
    expect(container.textContent).toContain("C");

    await render(absentComposition);
    expect(container.querySelectorAll("button.conversation-suggestion")).toHaveLength(0);
    expect(container.textContent).not.toContain("A label");

    await render(restoredComposition);
    expect(container.querySelectorAll("button.conversation-suggestion")).toHaveLength(3);
    expect(container.textContent).toContain("A");
    expect(container.textContent).toContain("B");
    expect(container.textContent).toContain("C");

    await act(async () => {
      (container.querySelector("button.conversation-suggestion") as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(assistantRuntime?.thread.getState().messages[0]?.content).toEqual([
      { type: "text", text: "Prompt A" },
    ]);
  });
});
