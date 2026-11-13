// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useAuiState } from "@assistant-ui/react";
import {
  AgentApplication,
  createAgentUIProject,
  createPluginCapabilityCatalog,
} from "../src/ui/index.js";
import {
  AGENT_UI_THREAD_BINDING_SERVICE,
  type ConversationThreadBindingFactory,
} from "../src/plugin-api/index.js";
import { useAgentUILocale } from "../src/locale.js";
import type { UIPluginDefinition } from "../src/contracts/index.js";
import { AGENT_UI_LOCALE_SERVICE } from "../src/ui/services/agent-ui-locale.js";

const cleanup: (() => void)[] = [];
afterEach(() =>
  act(() =>
    cleanup
      .splice(0)
      .reverse()
      .forEach((fn) => fn()),
  ),
);

it("uses an application-selected history port before opening the initial persisted thread in StrictMode", async () => {
  const load = vi.fn(async (id: string) => ({
    messages: [
      {
        id: "history",
        role: "user" as const,
        content: [{ type: "text", text: `Loaded ${id}` }],
        attachments: [],
        createdAt: new Date(0),
        metadata: { custom: {} },
      },
    ],
  }));
  const factory: ConversationThreadBindingFactory = (options) => ({
    getThreadId: () => options.initialThreadId ?? "new",
    subscribe: () => () => {},
    createNewThread: async () => "new",
    loadThread: load,
    getThreadListSnapshot: () => ({
      threads: [{ id: "persisted", status: "regular", title: "Persisted" }],
      archivedThreads: [],
    }),
  });
  const history: UIPluginDefinition = {
    manifest: {
      id: "custom-history",
      name: "History",
      description: "Application history",
      version: "1.0.0",
      capabilities: ["headless"],
    },
    provides: [AGENT_UI_THREAD_BINDING_SERVICE],
    setup: ({ services }) =>
      services.provide(AGENT_UI_THREAD_BINDING_SERVICE, factory),
    Component: () => null,
  };
  function SubscribedView() {
    const messages = useAuiState((state) => state.thread.messages);
    return (
      <output>
        {messages
          .map((message) =>
            message.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join(""),
          )
          .join("")}
      </output>
    );
  }
  const view: UIPluginDefinition = {
    manifest: {
      id: "view",
      name: "View",
      description: "Test view",
      version: "1.0.0",
    },
    Component: SubscribedView,
  };
  const project = createAgentUIProject({
    appUIModelSource: JSON.stringify({
      applicationPlugins: [{ pluginId: "custom-history" }],
      root: { type: "slot", plugins: [{ pluginId: "view" }] },
    }),
    capabilityCatalogRevision: "a".repeat(64),
    pluginCapabilityCatalog: createPluginCapabilityCatalog(
      [history, view].map((definition) => ({
        ...definition,
        provides: definition.provides ?? [],
        inject: [],
        optionalInject: [],
        loadDefinition: async () => definition,
      })),
    ),
  });
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  cleanup.push(
    () => node.remove(),
    () => root.unmount(),
  );
  await act(async () =>
    root.render(
      <StrictMode>
        <AgentApplication project={project} initialThreadId="persisted" />
      </StrictMode>,
    ),
  );
  await vi.waitFor(async () => {
    await act(async () => {});
    expect({ text: node.textContent, calls: load.mock.calls }).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("Loaded persisted"),
      }),
    );
  });
  expect(load).toHaveBeenCalledWith("persisted");
});

it("honors the selected locale service and preserves its custom namespaces", async () => {
  const snapshot = { locale: "en-US" as const, direction: "ltr" as const };
  const service = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    setLocale: vi.fn(),
    getMessages: () => ({ customDomain: { label: "Selected service" } }),
  };
  const provider: UIPluginDefinition = {
    manifest: {
      id: "custom-locale",
      name: "Locale",
      description: "Custom locale",
      version: "1.0.0",
      capabilities: ["headless"],
    },
    provides: [AGENT_UI_LOCALE_SERVICE],
    setup: ({ services }) => services.provide(AGENT_UI_LOCALE_SERVICE, service),
    Component: () => null,
  };
  function View() {
    return <output>{useAgentUILocale("customDomain").label}/{useAgentUILocale("applicationDomain").label}</output>;
  }
  const view: UIPluginDefinition = {
    manifest: {
      id: "view",
      name: "View",
      description: "View",
      version: "1.0.0",
    },
    Component: View,
  };
  const project = createAgentUIProject({
    locales: {"en-US":{applicationDomain:{label:"Project namespace"}},"zh-CN":{applicationDomain:{label:"Project namespace"}}},
    appUIModelSource: JSON.stringify({
      applicationPlugins: [{ pluginId: "custom-locale" }],
      root: { type: "slot", plugins: [{ pluginId: "view" }] },
    }),
    capabilityCatalogRevision: "a".repeat(64),
    pluginCapabilityCatalog: createPluginCapabilityCatalog(
      [provider, view].map((definition) => ({
        ...definition,
        provides: definition.provides ?? [],
        inject: [],
        optionalInject: [],
        loadDefinition: async () => definition,
      })),
    ),
  });
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  cleanup.push(
    () => node.remove(),
    () => root.unmount(),
  );
  await act(async () => root.render(<AgentApplication project={project} />));
  await act(async () => {
    await vi.waitFor(() => expect(node.textContent).toBe("Selected service/Project namespace"));
  });
});
