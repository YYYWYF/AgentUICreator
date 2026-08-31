import { Component, useEffect } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import {
  createPluginRegistry,
  UIPluginRuntime,
} from "../runtime/plugins";

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

let healthyMounts = 0;
let healthyUnmounts = 0;

function HealthyPlugin() {
  useEffect(() => {
    healthyMounts += 1;
    return () => {
      healthyUnmounts += 1;
    };
  }, []);

  return <button type="button">Healthy plugin action</button>;
}

function RenderFailurePlugin({ context }: UIPluginComponentProps) {
  if (context.instance.props?.shouldFail !== false) {
    throw new Error("Render fixture failed.");
  }

  return <div>Render fixture recovered.</div>;
}

class MountFailurePlugin extends Component<UIPluginComponentProps> {
  componentDidMount(): void {
    throw new Error("Mount fixture failed.");
  }

  render() {
    return <div>Mount fixture content</div>;
  }
}

function createDefinition(
  id: string,
  name: string,
  Component: UIPluginDefinition["Component"],
): UIPluginDefinition {
  return {
    manifest: {
      id,
      name,
      description: `${name} test fixture`,
      version: "1.0.0",
    },
    Component,
  };
}

const registry = createPluginRegistry([
  createDefinition("healthy", "Healthy Plugin", HealthyPlugin),
  createDefinition(
    "render-failure",
    "Render Failure Plugin",
    RenderFailurePlugin,
  ),
  createDefinition(
    "mount-failure",
    "Mount Failure Plugin",
    MountFailurePlugin,
  ),
]);

function createModel(
  pluginInstanceIds: string[],
  renderShouldFail = true,
) {
  return parseAppUIModel({
    version: "1",
    root: {
      type: "slot",
      id: "boundary-slot-node",
      slotId: "boundary-slot",
      pluginInstanceIds,
    },
    pluginInstances: {
      "healthy-main": {
        id: "healthy-main",
        pluginId: "healthy",
        enabled: true,
      },
      "render-failure-main": {
        id: "render-failure-main",
        pluginId: "render-failure",
        enabled: true,
        props: { shouldFail: renderShouldFail },
      },
      "mount-failure-main": {
        id: "mount-failure-main",
        pluginId: "mount-failure",
        enabled: true,
      },
    },
  });
}

function RuntimeFixture({
  model,
}: {
  model: ReturnType<typeof createModel>;
}) {
  return (
    <UIPluginRuntime
      actions={runtimeActions}
      messages={[]}
      model={model}
      registry={registry}
      run={{ status: "idle", errorMessage: undefined }}
      state={null}
    />
  );
}

function getText(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : getText(child)))
    .join("");
}

describe("PluginErrorBoundary", () => {
  let renderer: ReactTestRenderer | undefined;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    renderer = undefined;
    healthyMounts = 0;
    healthyUnmounts = 0;
    consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(async () => {
    if (renderer !== undefined) {
      await act(async () => renderer?.unmount());
    }
    consoleError.mockRestore();
  });

  async function render(model: ReturnType<typeof createModel>): Promise<void> {
    await act(async () => {
      if (renderer === undefined) {
        renderer = create(<RuntimeFixture model={model} />);
      } else {
        renderer.update(<RuntimeFixture model={model} />);
      }
    });
  }

  function findFailures(): ReactTestInstance[] {
    return (
      renderer?.root.findAll(
        (node) => node.props["data-plugin-state"] === "error",
      ) ?? []
    );
  }

  function findHealthyButton(): ReactTestInstance | undefined {
    return renderer?.root.findByProps({ children: "Healthy plugin action" });
  }

  it("isolates a dynamically inserted render failure in a top-right notification", async () => {
    await render(createModel(["healthy-main"]));

    expect(findHealthyButton()).toBeDefined();
    expect(healthyMounts).toBe(1);

    await render(createModel(["healthy-main", "render-failure-main"]));

    const [renderFailure] = findFailures();
    expect(renderFailure).toBeDefined();
    expect(getText(renderFailure!)).toContain("插件运行失败");
    expect(getText(renderFailure!)).toContain("Render fixture failed.");
    expect(
      renderer?.root.findAll(
        (node) =>
          node.props.className === "app-ui-plugin-instance" &&
          node.props["data-plugin-instance-id"] === "render-failure-main",
      ),
    ).toHaveLength(0);
    expect(findHealthyButton()).toBeDefined();
    expect(healthyMounts).toBe(1);
    expect(healthyUnmounts).toBe(0);

    await render(createModel(["healthy-main"]));

    expect(findFailures()).toHaveLength(0);
    expect(findHealthyButton()).toBeDefined();
    expect(healthyMounts).toBe(1);
    expect(healthyUnmounts).toBe(0);
  });

  it("lets the user dismiss one failure without remounting healthy plugins", async () => {
    await render(
      createModel([
        "healthy-main",
        "render-failure-main",
        "mount-failure-main",
      ]),
    );
    expect(findFailures()).toHaveLength(2);

    await act(async () => {
      renderer?.root
        .findByProps({ "aria-label": "关闭 Render Failure Plugin 错误提示" })
        .props.onClick();
    });

    const failures = findFailures();
    expect(failures).toHaveLength(1);
    expect(getText(failures[0]!)).toContain("Mount fixture failed.");
    expect(findHealthyButton()).toBeDefined();
    expect(healthyMounts).toBe(1);
    expect(healthyUnmounts).toBe(0);

    await render(
      createModel([
        "healthy-main",
        "render-failure-main",
        "mount-failure-main",
      ]),
    );

    expect(findFailures()).toHaveLength(1);
    expect(getText(findFailures()[0]!)).toContain("Mount fixture failed.");
  });

  it("isolates multiple render and lifecycle failures at the same time", async () => {
    await render(
      createModel([
        "healthy-main",
        "render-failure-main",
        "mount-failure-main",
      ]),
    );

    const failures = findFailures();
    expect(failures).toHaveLength(2);
    expect(failures.map(getText).join(" ")).toContain("Render fixture failed.");
    expect(failures.map(getText).join(" ")).toContain("Mount fixture failed.");
    expect(findHealthyButton()).toBeDefined();
    expect(healthyMounts).toBe(1);
    expect(healthyUnmounts).toBe(0);
  });

  it("resets the failed instance when its props change and renders its recovery", async () => {
    await render(createModel(["healthy-main", "render-failure-main"]));
    expect(findFailures().map(getText).join(" ")).toContain(
      "Render fixture failed.",
    );

    await render(
      createModel(["healthy-main", "render-failure-main"], false),
    );

    expect(findFailures()).toHaveLength(0);
    expect(
      renderer?.root.findByProps({ children: "Render fixture recovered." }),
    ).toBeDefined();
    expect(findHealthyButton()).toBeDefined();
    expect(healthyMounts).toBe(1);
    expect(healthyUnmounts).toBe(0);
  });
});
