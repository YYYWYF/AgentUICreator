// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentRuntime,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";

vi.mock("../src/dev/DevStudio/RuntimePanel", () => ({
  RuntimePanel: () => <div>Runtime panel</div>,
}));

import { AgentRuntimeProvider } from "../runtime/context";
import { DevStudio } from "../src/dev/DevStudio/DevStudio";

const catalog = {
  defaultScenarioId: "nested-subagent-conversation",
  scenarios: [
    {
      id: "nested-subagent-conversation",
      title: "AG-UI Subagent → Task Card",
      description: "Renders a standard nested Subagent conversation.",
      category: "multi-agent",
      capabilities: ["subagent"],
    },
  ],
};

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedDevStudio {
  dock: HTMLDivElement;
  panelHost: HTMLDivElement;
  root: Root;
  container: HTMLDivElement;
}

async function mountDevStudio(endpoint: string): Promise<MountedDevStudio> {
  const container = document.createElement("div");
  const dock = document.createElement("div");
  const panelHost = document.createElement("div");
  dock.dataset.slot = "agent-ui-dev-studio-dock";
  panelHost.dataset.slot = "agent-ui-dev-studio-panel";
  document.body.append(dock, panelHost, container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <AgentRuntimeProvider runtime={createRuntime()}>
        <DevStudio endpoint={endpoint} />
      </AgentRuntimeProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  return { container, dock, panelHost, root };
}

function unmountDevStudio(mounted: MountedDevStudio): void {
  mounted.root.unmount();
  mounted.container.remove();
  mounted.dock.remove();
  mounted.panelHost.remove();
}

function findEntry(
  mounted: MountedDevStudio,
  label: string,
): HTMLButtonElement {
  const button = mounted.dock.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (button === null) throw new Error(`Missing Dev Studio entry: ${label}`);
  return button;
}

function createRuntime(): AgentRuntime {
  const snapshot: AgentRuntimeSnapshot = {
    conversation: { id: "dev-studio-test" },
    messages: [],
    state: undefined,
    run: { status: "idle" },
    executions: [],
    interrupts: [],
  };
  return {
    mode: "test",
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    subscribeApplicationEvents: () => () => undefined,
    sendMessage: async () => undefined,
    resumeInterrupts: async () => undefined,
    startNewConversation: async () => undefined,
    abort: () => undefined,
    dispose: () => undefined,
  };
}

describe("Agent UI Dev Studio shell", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => catalog,
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fall back to a standalone Dev Studio surface", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AgentRuntimeProvider runtime={createRuntime()}>
          <DevStudio endpoint="/__agent-ui/mock" />
        </AgentRuntimeProvider>,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-agent-ui-dev-studio-entry]')).toBeNull();
    expect(container.querySelector('[role="region"]')).toBeNull();
    root.unmount();
    container.remove();
  });

  it("shows Scenario and Runtime tabs for Mock development", async () => {
    const mounted = await mountDevStudio("/__agent-ui/mock");

    await act(async () => {
      findEntry(mounted, "Open Mock Agent panel").click();
    });

    expect(mounted.panelHost.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(mounted.panelHost.textContent).toContain("Scenario");
    expect(mounted.panelHost.textContent).toContain("Runtime");
    expect(mounted.panelHost.querySelector('[aria-modal="true"]')).toBeNull();
    expect(mounted.panelHost.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      findEntry(mounted, "Close Mock Agent panel").click();
    });

    expect(mounted.panelHost.querySelectorAll('[role="tab"]')).toHaveLength(0);
    unmountDevStudio(mounted);
  });

  it("shows only Runtime for a real development endpoint", async () => {
    const mounted = await mountDevStudio("https://agent.example/api");

    await act(async () => {
      findEntry(mounted, "Open Agent UI Dev Studio").click();
    });

    expect(mounted.panelHost.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(mounted.panelHost.textContent).toContain("Runtime panel");
    expect(mounted.panelHost.textContent).not.toContain("Scenario");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    unmountDevStudio(mounted);
  });

  it("starts collapsed after a page reload and stays open until the user closes it", async () => {
    const firstMounted = await mountDevStudio("/__agent-ui/mock");

    await act(async () => {
      findEntry(firstMounted, "Open Mock Agent panel").click();
    });
    unmountDevStudio(firstMounted);

    const mounted = await mountDevStudio("/__agent-ui/mock");

    expect(findEntry(mounted, "Open Mock Agent panel")).toBeDefined();

    await act(async () => {
      findEntry(mounted, "Open Mock Agent panel").click();
    });

    expect(findEntry(mounted, "Close Mock Agent panel")).toBeDefined();

    await act(async () => {
      findEntry(mounted, "Close Mock Agent panel").click();
    });
    expect(findEntry(mounted, "Open Mock Agent panel")).toBeDefined();
    unmountDevStudio(mounted);
  });
});
