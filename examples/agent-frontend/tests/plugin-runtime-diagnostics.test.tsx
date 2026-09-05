import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import {
  createPluginRegistry,
  UIPluginRuntime,
  type RuntimeDiagnostic,
} from "../runtime/plugins";
import { sha256Text } from "../runtime/diagnostics";

const appUIModelHash = "a".repeat(64);
const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

function createDefinition(
  id: string,
  options: Pick<UIPluginDefinition, "Component" | "setup">,
): UIPluginDefinition {
  return {
    manifest: {
      id,
      name: `${id} name`,
      description: `${id} diagnostic fixture`,
      version: "1.0.0",
    },
    ...options,
  };
}

function createModel(shouldFail = true) {
  return parseAppUIModel({
    version: "2",
    root: {
      type: "panel",
      id: "diagnostic-panel",
      child: {
        type: "slot",
        id: "diagnostic-slot-node",
        slotId: "diagnostic-slot",
      },
    },
    pluginInstances: {
      "diagnostic-main": {
        id: "diagnostic-main",
        pluginId: "diagnostic-plugin",
        enabled: true,
        mount: { slotId: "diagnostic-slot" },
        props: { shouldFail },
      },
    },
  });
}

function RuntimeFixture({
  definition,
  model = createModel(),
  reporter,
}: {
  definition: UIPluginDefinition;
  model?: ReturnType<typeof createModel> | undefined;
  reporter(diagnostic: RuntimeDiagnostic): void;
}) {
  return (
    <UIPluginRuntime
      actions={runtimeActions}
      appUIModelHash={appUIModelHash}
      conversation={{ id: "diagnostics-test" }}
      executions={[]}
      messages={[]}
      model={model}
      onRuntimeDiagnostic={reporter}
      registry={createPluginRegistry([definition])}
      run={{ status: "idle" }}
      state={null}
    />
  );
}

describe("plugin runtime diagnostics", () => {
  let renderer: ReactTestRenderer | undefined;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    if (renderer !== undefined) {
      await act(async () => renderer?.unmount());
    }
    renderer = undefined;
    consoleError.mockRestore();
  });

  it("attributes render failures and recovery to the exact plugin, instance, Slot, and model hash", async () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const definition = createDefinition("diagnostic-plugin", {
      Component: ({ context }) => {
        if (context.instance.props?.shouldFail === true) {
          throw new Error("Diagnostic render failed.");
        }
        return <div>Recovered</div>;
      },
    });

    await act(async () => {
      renderer = create(
        <RuntimeFixture
          definition={definition}
          reporter={(diagnostic) => diagnostics.push(diagnostic)}
        />,
      );
    });

    const failure = diagnostics.find(
      (diagnostic) =>
        diagnostic.kind === "plugin-render" &&
        diagnostic.status === "error",
    );
    expect(failure).toMatchObject({
      appUIModelHash,
      errorMessage: "Diagnostic render failed.",
      instanceId: "diagnostic-main",
      pluginId: "diagnostic-plugin",
      slotId: "diagnostic-slot",
      slotPath: "root.child",
    });
    expect(failure?.componentStack).toContain("RuntimeFixture");

    await act(async () => {
      renderer?.update(
        <RuntimeFixture
          definition={definition}
          model={createModel(false)}
          reporter={(diagnostic) => diagnostics.push(diagnostic)}
        />,
      );
    });
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.kind === "plugin-render" &&
          diagnostic.status === "resolved" &&
          diagnostic.instanceId === "diagnostic-main",
      ),
    ).toBe(true);
  });

  it("reports setup failures without turning them into anonymous console errors", async () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const definition = createDefinition("diagnostic-plugin", {
      Component: () => <div>Never activated</div>,
      setup: () => {
        throw new Error("Diagnostic setup failed.");
      },
    });

    await act(async () => {
      renderer = create(
        <RuntimeFixture
          definition={definition}
          reporter={(diagnostic) => diagnostics.push(diagnostic)}
        />,
      );
    });

    expect(
      diagnostics.find(
        (diagnostic) =>
          diagnostic.kind === "plugin-activation" &&
          diagnostic.status === "error",
      ),
    ).toMatchObject({
      appUIModelHash,
      errorMessage: "Diagnostic setup failed.",
      instanceId: "diagnostic-main",
      pluginId: "diagnostic-plugin",
      slotId: "diagnostic-slot",
      slotPath: "root.child",
    });
  });

  it("keeps the frontend alive when the optional reporter is unavailable", async () => {
    const definition = createDefinition("diagnostic-plugin", {
      Component: () => {
        throw new Error("Reporter is unavailable.");
      },
    });

    await act(async () => {
      renderer = create(
        <RuntimeFixture
          definition={definition}
          reporter={() => {
            throw new Error("Endpoint unavailable");
          }}
        />,
      );
    });

    expect(
      renderer?.root.findAll(
        (node) => node.props["data-plugin-state"] === "error",
      ),
    ).toHaveLength(1);
  });

  it("does not attribute ordinary console errors to a plugin", async () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const definition = createDefinition("diagnostic-plugin", {
      Component: () => <div>Healthy plugin</div>,
    });
    await act(async () => {
      renderer = create(
        <RuntimeFixture
          definition={definition}
          reporter={(diagnostic) => diagnostics.push(diagnostic)}
        />,
      );
    });
    console.error("Unattributed browser failure");
    expect(
      diagnostics.filter((diagnostic) => diagnostic.status === "error"),
    ).toHaveLength(0);
  });

  it("hashes the exact AppUIModel source bytes used by project inspection", async () => {
    const projectRoot = path.resolve(import.meta.dirname, "..");
    const source = await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    );
    expect(await sha256Text(source)).toBe(
      createHash("sha256").update(source).digest("hex"),
    );
  });

  it("keeps Creator packages and endpoints outside the standalone target source", async () => {
    const projectRoot = path.resolve(import.meta.dirname, "..");
    const sources = await Promise.all(
      [
        "src/App.tsx",
        "runtime/diagnostics/PluginDiagnosticContext.tsx",
        "runtime/plugins/UIPluginRuntime.tsx",
      ].map((relativePath) =>
        readFile(path.join(projectRoot, relativePath), "utf8"),
      ),
    );
    expect(sources.join("\n")).not.toContain("@agent-ui/creator");
    expect(sources.join("\n")).not.toContain("/__creator/");
  });
});
