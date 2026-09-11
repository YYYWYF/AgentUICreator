// @vitest-environment jsdom

import type { ReactNode } from "react";
import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentRuntime } from "@agent-ui/runtime-core";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import type {
  AgentMessage,
  AgentRunState,
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import { ConversationSurfacePlugin } from "../plugins/conversation-surface";
import { conversationSurfacePlugin } from "../plugins/conversation-surface/definition";
import {
  AgentRuntimeProvider,
  PluginInstanceProvider,
} from "../runtime/context";
import {
  PluginServiceConsumerContext,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
  createPluginRegistry,
} from "../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type AgentUIConversationService,
  type ConversationSnapshot,
} from "../services/conversations";

interface SlotCall {
  slotId: string;
  fallback: ReactNode;
}

const idleRun: AgentRunState = { status: "idle" };

function createConversationService(
  snapshot: ConversationSnapshot,
): AgentUIConversationService {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    refresh: async () => undefined,
    selectConversation: async () => undefined,
    showLiveConversation: () => undefined,
    startNewConversation: async () => undefined,
  };
}

/**
 * A minimal provider plugin for the Conversation Service. The Surface only
 * needs the service to exist so `usePluginService` can resolve it.
 */
function createConversationServicePlugin(
  snapshot: ConversationSnapshot,
): UIPluginDefinition {
  return {
    manifest: {
      id: "conversation-service-fixture",
      name: "Conversation Service Fixture",
      description: "Provides the Conversation Service snapshot for Surface tests.",
      version: "1.0.0",
      capabilities: ["headless"],
    },
    provides: [AGENT_UI_CONVERSATION_SERVICE],
    setup: ({ services }) => {
      services.provide(
        AGENT_UI_CONVERSATION_SERVICE,
        createConversationService(snapshot),
      );
    },
    Component: () => null,
  };
}

interface MountSurfaceOptions {
  messages?: AgentMessage[];
  run?: AgentRunState;
  slotMarkers?: Record<string, ReactNode>;
  conversationSnapshot?: ConversationSnapshot;
}

const mountedRenderers: ReactTestRenderer[] = [];
const serviceRuntimes: PluginServiceRuntime[] = [];

function createStaticRuntime(
  snapshot: {
    conversation: { id: string };
    messages: AgentMessage[];
    run: AgentRunState;
  },
): AgentRuntime {
  return {
    mode: "test",
    getSnapshot: () => ({
      conversation: snapshot.conversation,
      messages: snapshot.messages,
      state: null,
      run: snapshot.run,
      executions: [],
      interrupts: [],
    }),
    subscribe: () => () => undefined,
    subscribeApplicationEvents: () => () => undefined,
    sendMessage: async () => undefined,
    resumeInterrupts: async () => undefined,
    startNewConversation: async () => undefined,
    abort: () => undefined,
    dispose: () => undefined,
  };
}

async function mountSurface({
  messages = [],
  run = idleRun,
  slotMarkers = {},
  conversationSnapshot = EMPTY_CONVERSATION_SNAPSHOT,
}: MountSurfaceOptions = {}) {
  const calls: SlotCall[] = [];
  const serviceRuntime = new PluginServiceRuntime();
  serviceRuntimes.push(serviceRuntime);
  const actions = {
    sendMessage: async () => undefined,
    resumeInterrupts: async () => undefined,
    startNewConversation: async () => undefined,
    abortRun: () => undefined,
    updateInstanceProps: () => undefined,
  };
  const model: AppUIModel = {
    version: "2",
    root: { type: "slot", id: "conversation-root", slotId: "workspace.conversation" },
    pluginInstances: {
      "conversation-service-fixture-main": {
        id: "conversation-service-fixture-main",
        pluginId: "conversation-service-fixture",
        enabled: true,
      },
    },
  };
  serviceRuntime.reconcile(
    model,
    createPluginRegistry([createConversationServicePlugin(conversationSnapshot)]),
    actions,
  );

  const renderSlot = (slotId: string, fallback?: ReactNode): ReactNode => {
    calls.push({ slotId, fallback });
    return slotMarkers[slotId] ?? null;
  };

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <AgentRuntimeProvider
        runtime={createStaticRuntime({
          conversation: { id: "default" },
          messages,
          run,
        })}
      >
        <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
          <PluginServiceConsumerContext.Provider
            value={{
              pluginId: "conversation-surface",
              instanceId: "agent-conversation-surface-main",
              provides: [],
              inject: [],
              optionalInject: [AGENT_UI_CONVERSATION_SERVICE],
            }}
          >
            <PluginInstanceProvider
              actions={actions}
              events={{ subscribe: () => () => undefined }}
              instance={{
                id: "agent-conversation-surface-main",
                pluginId: "conversation-surface",
                enabled: true,
                mount: { slotId: "workspace.conversation" },
              }}
            >
              <ConversationSurfacePlugin renderSlot={renderSlot} />
            </PluginInstanceProvider>
          </PluginServiceConsumerContext.Provider>
        </PluginServiceRuntimeContext.Provider>
      </AgentRuntimeProvider>,
    );
  });

  if (renderer === undefined) {
    throw new Error("ConversationSurface renderer was not created");
  }
  mountedRenderers.push(renderer);

  return {
    calls,
    renderer,
    slotIds: () => calls.map((call) => call.slotId),
  };
}

function messageFixture(id: string, content: string): AgentMessage {
  return {
    id,
    producer: { type: "root" },
    role: "user",
    content,
    metadata: { conversationId: "default" },
  };
}

afterEach(async () => {
  await act(async () => {
    for (const renderer of mountedRenderers.splice(0)) renderer.unmount();
  });
  for (const runtime of serviceRuntimes.splice(0)) runtime.dispose();
  document.body.replaceChildren();
});

describe("conversation-surface Slot contract", () => {
  it("declares exactly the four peer child Slots and drops conversation.empty", () => {
    const children = conversationSurfacePlugin.manifest.slots?.children ?? [];
    expect(children).toEqual([
      "conversation.empty.welcome",
      "conversation.empty.suggestions",
      "conversation.timeline",
      "conversation.composer",
    ]);
    expect(children).not.toContain("conversation.empty");
    expect(conversationSurfacePlugin.manifest.version).toBe("2.0.0");
  });

  it("renders Welcome and Suggestions as two peer regions of one empty state", async () => {
    const mounted = await mountSurface({
      slotMarkers: {
        "conversation.empty.welcome": <span id="welcome-marker" />,
        "conversation.empty.suggestions": <span id="suggestions-marker" />,
      },
    });

    expect(mounted.slotIds()).toEqual([
      "conversation.empty.welcome",
      "conversation.empty.suggestions",
      "conversation.composer",
    ]);
    const empty = mounted.renderer.root.findByProps({
      "data-slot": "conversation-empty",
    });
    expect(
      empty.findAllByProps({ "data-slot": "conversation-empty-welcome" }),
    ).toHaveLength(1);
    expect(
      empty.findAllByProps({ "data-slot": "conversation-empty-suggestions" }),
    ).toHaveLength(1);
    expect(mounted.renderer.root.findByProps({ id: "welcome-marker" })).toBeDefined();
    expect(
      mounted.renderer.root.findByProps({ id: "suggestions-marker" }),
    ).toBeDefined();
  });

  it("keeps rendering one empty region when the other Slot has no renderer", async () => {
    const welcomeOnly = await mountSurface({
      slotMarkers: { "conversation.empty.welcome": <span id="welcome-only" /> },
    });
    expect(
      welcomeOnly.renderer.root.findAllByProps({
        "data-slot": "conversation-empty-welcome",
      }),
    ).toHaveLength(1);
    expect(
      welcomeOnly.renderer.root.findAllByProps({
        "data-slot": "conversation-empty-suggestions",
      }),
    ).toHaveLength(1);
    expect(
      welcomeOnly.renderer.root.findByProps({ id: "welcome-only" }),
    ).toBeDefined();

    const suggestionsOnly = await mountSurface({
      slotMarkers: {
        "conversation.empty.suggestions": <span id="suggestions-only" />,
      },
    });
    expect(
      suggestionsOnly.renderer.root.findAllByProps({
        "data-slot": "conversation-empty-suggestions",
      }),
    ).toHaveLength(1);
    expect(
      suggestionsOnly.renderer.root.findByProps({ id: "suggestions-only" }),
    ).toBeDefined();
    expect(
      suggestionsOnly.renderer.root.findAllByProps({
        "data-slot": "conversation-empty-welcome",
      }),
    ).toHaveLength(1);
  });

  it("keeps the two empty Slots independently replaceable", async () => {
    // Case A: only Welcome is replaced.
    const replacedWelcome = await mountSurface({
      slotMarkers: {
        "conversation.empty.welcome": <span id="custom-welcome" />,
        "conversation.empty.suggestions": <span id="default-suggestions" />,
      },
    });
    expect(
      replacedWelcome.renderer.root.findByProps({ id: "custom-welcome" }),
    ).toBeDefined();
    expect(
      replacedWelcome.renderer.root.findByProps({ id: "default-suggestions" }),
    ).toBeDefined();
    expect(replacedWelcome.slotIds()).toEqual([
      "conversation.empty.welcome",
      "conversation.empty.suggestions",
      "conversation.composer",
    ]);

    // Case B: only Suggestions is replaced.
    const replacedSuggestions = await mountSurface({
      slotMarkers: {
        "conversation.empty.welcome": <span id="default-welcome" />,
        "conversation.empty.suggestions": <span id="custom-suggestions" />,
      },
    });
    expect(
      replacedSuggestions.renderer.root.findByProps({ id: "default-welcome" }),
    ).toBeDefined();
    expect(
      replacedSuggestions.renderer.root.findByProps({
        id: "custom-suggestions",
      }),
    ).toBeDefined();
  });

  it("never asks the runtime for the removed conversation.empty Slot", async () => {
    const mounted = await mountSurface({
      slotMarkers: {
        "conversation.empty.welcome": <span id="welcome-marker" />,
        "conversation.empty.suggestions": <span id="suggestions-marker" />,
      },
    });
    expect(mounted.slotIds()).not.toContain("conversation.empty");
  });
});

describe("conversation-surface conversation state semantics", () => {
  it("keeps the empty state until a visible chat message exists", async () => {
    const mounted = await mountSurface();
    expect(
      mounted.renderer.root.findByProps({
        "data-ui-plugin": "conversation-surface",
      }).props["data-conversation-state"],
    ).toBe("empty");
    expect(mounted.slotIds()).toEqual([
      "conversation.empty.welcome",
      "conversation.empty.suggestions",
      "conversation.composer",
    ]);
  });

  it("keeps non-chat messages out of the timeline decision", async () => {
    const mounted = await mountSurface({
      messages: [
        {
          id: "tool-only",
          producer: { type: "root" },
          role: "tool",
          toolCallId: "tool-call-only",
          content: "工具结果",
          metadata: { conversationId: "default" },
        },
      ],
    });
    expect(
      mounted.renderer.root.findByProps({
        "data-ui-plugin": "conversation-surface",
      }).props["data-conversation-state"],
    ).toBe("empty");
    expect(mounted.slotIds()).not.toContain("conversation.timeline");
  });

  it("switches to the timeline while running and hides both empty Slots", async () => {
    const mounted = await mountSurface({
      run: { status: "running" },
      slotMarkers: {
        "conversation.empty.welcome": <span id="welcome-marker" />,
        "conversation.empty.suggestions": <span id="suggestions-marker" />,
        "conversation.timeline": <span id="timeline-marker" />,
      },
    });
    expect(
      mounted.renderer.root.findByProps({
        "data-ui-plugin": "conversation-surface",
      }).props["data-conversation-state"],
    ).toBe("timeline");
    expect(mounted.slotIds()).toEqual([
      "conversation.timeline",
      "conversation.composer",
    ]);
    expect(
      mounted.renderer.root.findAllByProps({
        "data-slot": "conversation-empty",
      }),
    ).toHaveLength(0);
  });

  it("switches to the timeline as soon as a visible chat message arrives", async () => {
    const mounted = await mountSurface({
      messages: [messageFixture("user-1", "你好")],
      slotMarkers: { "conversation.timeline": <span id="timeline-marker" /> },
    });
    expect(
      mounted.renderer.root.findByProps({
        "data-ui-plugin": "conversation-surface",
      }).props["data-conversation-state"],
    ).toBe("timeline");
    expect(mounted.slotIds()).toEqual([
      "conversation.timeline",
      "conversation.composer",
    ]);
  });

  it("always renders the composer slot, including the empty state", async () => {
    const mounted = await mountSurface({
      slotMarkers: { "conversation.composer": <span id="composer-marker" /> },
    });
    expect(mounted.slotIds()).toContain("conversation.composer");
    expect(
      mounted.renderer.root.findByProps({ id: "composer-marker" }),
    ).toBeDefined();
  });
});

describe("conversation-surface empty state CSS ownership", () => {
  it("keeps the empty state tokenized and free of per-plugin cards", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const css = await readFile(
      path.join(projectRoot, "plugins/conversation-surface/styles.css"),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).toMatch(/var\(--aui-/u);
    expect(css).toMatch(/\.conversation-surface-empty-welcome/u);
    expect(css).toMatch(/\.conversation-surface-empty-suggestions/u);
  });
});
