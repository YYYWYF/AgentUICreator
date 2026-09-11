// @vitest-environment jsdom

import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentThreadWelcome } from "../agent-ui/components/thread-welcome";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
} from "../runtime/plugins";
import { AgentUIRootContext } from "../agent-ui/foundation/context";
import { agentThreadWelcomePlugin } from "../plugins/agent-thread-welcome/definition";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const idleRun = { status: "idle" as const };

function createWelcomeModel(props?: Record<string, unknown>) {
  return parseAppUIModel({
    version: "2",
    root: { type: "slot", id: "welcome-node", slotId: "conversation.empty.welcome" },
    pluginInstances: {
      "agent-welcome-main": {
        id: "agent-welcome-main",
        pluginId: "agent-thread-welcome",
        enabled: true,
        mount: { slotId: "conversation.empty.welcome" },
        ...(props === undefined ? {} : { props }),
      },
    },
  });
}

const runtimeActions = {
  sendMessage: async () => undefined,
  resumeInterrupts: async () => undefined,
  startNewConversation: async () => undefined,
  abortRun: () => undefined,
  updateInstanceProps: () => undefined,
};

async function mountWelcome(props?: Record<string, unknown>) {
  const model = createWelcomeModel(props);
  const registry = createPluginRegistry([agentThreadWelcomePlugin]);
  const serviceRuntime = new PluginServiceRuntime();
  serviceRuntime.reconcile(model, registry, runtimeActions);
  let renderer: ReactTestRenderer | undefined;

  await act(async () => {
    renderer = create(
      <AgentUIRootContext.Provider value={{ portalContainer: null }}>
        <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
          <PluginRuntimeFixture
            actions={runtimeActions}
            conversation={{ id: "live" }}
            executions={[]}
            interrupts={[]}
            messages={[]}
            model={model}
            registry={registry}
            run={idleRun}
            state={{}}
          />
        </PluginServiceRuntimeContext.Provider>
      </AgentUIRootContext.Provider>,
    );
  });

  if (renderer === undefined) {
    serviceRuntime.dispose();
    throw new Error("Welcome renderer was not created");
  }

  return {
    renderer,
    dispose: async () => {
      await act(async () => renderer?.unmount());
      serviceRuntime.dispose();
    },
  };
}

function textContent(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textContent(child)))
    .join("");
}

const mounted: Array<{ dispose(): Promise<void> }> = [];

afterEach(async () => {
  for (const entry of mounted.splice(0)) await entry.dispose();
});

describe("agent-thread-welcome runtime binding", () => {
  it("binds instance props to the pure AgentThreadWelcome component", async () => {
    const welcome = await mountWelcome({
      title: "自定义标题",
      description: "自定义描述",
      eyebrow: "New task",
    });
    mounted.push(welcome);

    const surface = welcome.renderer.root.findByType(AgentThreadWelcome);
    expect(surface.props.title).toBe("自定义标题");
    expect(surface.props.description).toBe("自定义描述");
    expect(surface.props.eyebrow).toBe("New task");
    expect(
      welcome.renderer.root.findByProps({ "data-ui-plugin": "agent-thread-welcome" }),
    ).toBeDefined();
    expect(textContent(welcome.renderer.root)).toContain("自定义标题");
  });

  it("falls back to canonical defaults without inventing runtime status", async () => {
    const welcome = await mountWelcome();
    mounted.push(welcome);

    const surface = welcome.renderer.root.findByType(AgentThreadWelcome);
    expect(surface.props.title).toBe("Agent Frontend");
    expect(typeof surface.props.description).toBe("string");
    expect(surface.props.eyebrow).toBeUndefined();
    const markup = JSON.stringify(welcome.renderer.toJSON());
    expect(markup).not.toContain("AG-UI STREAM");
    expect(markup).not.toContain("PLUGIN COMPOSED");
    expect(markup).not.toContain("data-agent-run-status");
  });

  it("allows the optional icon to be turned off without changing ownership", async () => {
    const welcome = await mountWelcome({ showIcon: false });
    mounted.push(welcome);

    expect(
      welcome.renderer.root.findAllByProps({
        "data-slot": "agent-thread-welcome-icon",
      }),
    ).toHaveLength(0);
  });

  it("never renders Suggestions or a send action", async () => {
    const welcome = await mountWelcome();
    mounted.push(welcome);

    expect(
      welcome.renderer.root.findAllByProps({ "data-slot": "agent-suggestions" }),
    ).toHaveLength(0);
    expect(
      welcome.renderer.root.findAllByProps({ "data-slot": "agent-suggestion" }),
    ).toHaveLength(0);
  });
});

describe("agent-thread-welcome policy", () => {
  it("does not import Ant Design or Runtime contracts", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    for (const fileName of ["index.tsx", "definition.ts", "styles.css", "manifest.json"]) {
      const source = await readFile(
        path.join(projectRoot, "plugins/agent-thread-welcome", fileName),
        "utf8",
      );
      expect(source, fileName).not.toMatch(
        /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-/u,
      );
    }
    const css = await readFile(
      path.join(projectRoot, "plugins/agent-thread-welcome/styles.css"),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/u);
    expect(css).not.toMatch(/(?:linear|radial)-gradient\s*\(/u);
    expect(css).not.toMatch(/\.ant-|development-preview|--ui-/u);
    expect(css).toMatch(/var\(--aui-/u);
  });

  it("only renders the Agent Component instead of its own Welcome DOM", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const indexSource = await readFile(
      path.join(projectRoot, "plugins/agent-thread-welcome/index.tsx"),
      "utf8",
    );
    expect(indexSource).toContain(
      'from "../../agent-ui/components/thread-welcome"',
    );
    expect(indexSource).toMatch(/<AgentThreadWelcome\b/u);
    expect(indexSource).not.toMatch(/AgentSuggestion|sendMessage|useAgent/u);
  });
});
