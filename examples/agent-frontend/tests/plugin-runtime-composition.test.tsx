import { StrictMode } from "react";
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
  type RuntimeCompositionSnapshot,
} from "../runtime/plugins";

const appUIModelHash = "c".repeat(64);
const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

function createModel(enabled = true) {
  return parseAppUIModel({
    version: "2",
    root: {
      type: "slot",
      id: "root-slot-node",
      slotId: "root-slot",
    },
    pluginInstances: {
      "owner-main": {
        id: "owner-main",
        pluginId: "owner-plugin",
        enabled,
        mount: { slotId: "root-slot" },
      },
      "child-main": {
        id: "child-main",
        pluginId: "child-plugin",
        enabled,
        mount: { slotId: "owner.child" },
      },
    },
  });
}

function definitions(childThrows = false): UIPluginDefinition[] {
  return [
    {
      manifest: {
        id: "owner-plugin",
        name: "Owner Plugin",
        description: "Composition owner fixture",
        version: "1.0.0",
        slots: { children: ["owner.child"] },
      },
      Component: ({ renderSlot }) => (
        <section>{renderSlot("owner.child")}</section>
      ),
    },
    {
      manifest: {
        id: "child-plugin",
        name: "Child Plugin",
        description: "Composition child fixture",
        version: "1.0.0",
      },
      Component: () => {
        if (childThrows) throw new Error("Child render failed.");
        return <div>Committed child</div>;
      },
    },
  ];
}

function RuntimeFixture({
  childThrows = false,
  enabled = true,
  reporter,
}: {
  childThrows?: boolean | undefined;
  enabled?: boolean | undefined;
  reporter(snapshot: RuntimeCompositionSnapshot): void;
}) {
  return (
    <UIPluginRuntime
      actions={runtimeActions}
      appUIModelHash={appUIModelHash}
      messages={[]}
      model={createModel(enabled)}
      onRuntimeComposition={reporter}
      registry={createPluginRegistry(definitions(childThrows))}
      run={{ status: "idle", errorMessage: undefined }}
      state={null}
    />
  );
}

describe("plugin runtime composition", () => {
  let renderer: ReactTestRenderer | undefined;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(async () => {
    if (renderer !== undefined) {
      await act(async () => renderer?.unmount());
    }
    renderer = undefined;
    consoleError.mockRestore();
  });

  it("reports actual React commits for a Layout Slot and a container child Slot", async () => {
    const snapshots: RuntimeCompositionSnapshot[] = [];
    await act(async () => {
      renderer = create(
        <RuntimeFixture reporter={(snapshot) => snapshots.push(snapshot)} />,
      );
      await Promise.resolve();
    });

    expect(snapshots.at(-1)).toMatchObject({
      appUIModelHash,
      instances: [
        {
          instanceId: "child-main",
          pluginId: "child-plugin",
          slotId: "owner.child",
        },
        {
          instanceId: "owner-main",
          pluginId: "owner-plugin",
          slotId: "root-slot",
          slotPath: "root",
        },
      ],
    });
  });

  it("does not report a PluginComponent whose render failed before commit", async () => {
    const snapshots: RuntimeCompositionSnapshot[] = [];
    await act(async () => {
      renderer = create(
        <RuntimeFixture
          childThrows
          reporter={(snapshot) => snapshots.push(snapshot)}
        />,
      );
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.instances).toEqual([
      {
        instanceId: "owner-main",
        pluginId: "owner-plugin",
        slotId: "root-slot",
        slotPath: "root",
      },
    ]);
  });

  it("coalesces StrictMode effect replay and reports an empty synchronized snapshot after unmount", async () => {
    const snapshots: RuntimeCompositionSnapshot[] = [];
    const reporter = (snapshot: RuntimeCompositionSnapshot) =>
      snapshots.push(snapshot);
    await act(async () => {
      renderer = create(
        <StrictMode>
          <RuntimeFixture reporter={reporter} />
        </StrictMode>,
      );
      await Promise.resolve();
    });
    expect(snapshots.at(-1)?.instances).toHaveLength(2);

    await act(async () => {
      renderer?.update(
        <StrictMode>
          <RuntimeFixture enabled={false} reporter={reporter} />
        </StrictMode>,
      );
      await Promise.resolve();
    });
    expect(snapshots.at(-1)).toMatchObject({
      appUIModelHash,
      instances: [],
    });
  });
});
