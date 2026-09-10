import { StrictMode, useState } from "react";
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
  type PluginRegistry,
  type RuntimeCompositionSnapshot,
  type RuntimeDiagnostic,
} from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const appUIModelHash = "c".repeat(64);
const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
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

function definitions(
  childThrows = false,
  renderChildTwice = false,
  childWidth?: "narrow" | "wide",
): UIPluginDefinition[] {
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
        <section>
          {renderSlot("owner.child")}
          {renderChildTwice ? renderSlot("owner.child") : null}
        </section>
      ),
    },
    {
      manifest: {
        id: "child-plugin",
        name: "Child Plugin",
        description: "Composition child fixture",
        version: "1.0.0",
        ...(childWidth === undefined ? {} : { layout: { width: childWidth } }),
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
  renderChildTwice = false,
  childWidth,
  diagnosticReporter,
  pluginRegistry,
  reporter,
}: {
  childThrows?: boolean | undefined;
  enabled?: boolean | undefined;
  renderChildTwice?: boolean | undefined;
  childWidth?: "narrow" | "wide" | undefined;
  diagnosticReporter?: ((diagnostic: RuntimeDiagnostic) => void) | undefined;
  pluginRegistry?: PluginRegistry | undefined;
  reporter(snapshot: RuntimeCompositionSnapshot): void;
}) {
  return (
    <PluginRuntimeFixture
      actions={runtimeActions}
      appUIModelHash={appUIModelHash}
      conversation={{ id: "composition-test" }}
      executions={[]}
      interrupts={[]}
      messages={[]}
      model={createModel(enabled)}
      onRuntimeComposition={reporter}
      onRuntimeDiagnostic={diagnosticReporter}
      registry={pluginRegistry ?? createPluginRegistry(
        definitions(childThrows, renderChildTwice, childWidth),
      )}
      run={{ status: "idle" }}
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
    vi.unstubAllGlobals();
  });

  it("reports a wide Plugin mounted in a narrow child Slot without hiding it", async () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );

    await act(async () => {
      renderer = create(
        <RuntimeFixture
          childWidth="wide"
          diagnosticReporter={(diagnostic) => diagnostics.push(diagnostic)}
          reporter={() => undefined}
        />,
        {
          createNodeMock: () => ({
            getBoundingClientRect: () => ({ width: 320 }),
          }),
        },
      );
      await Promise.resolve();
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "PLUGIN_WIDTH_INCOMPATIBLE",
        kind: "plugin-width-incompatible",
        pluginId: "child-plugin",
        instanceId: "child-main",
        slotId: "owner.child",
        requiredWidth: "wide",
        actualWidthClass: "narrow",
      }),
    );
    expect(renderer.root.findByProps({ children: "Committed child" })).toBeTruthy();
  });

  it("keeps width diagnostics open until every occurrence of a logical Slot is wide", async () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const snapshots: RuntimeCompositionSnapshot[] = [];
    const observedNodes = new Map<
      object,
      { callback: ResizeObserverCallback; observer: ResizeObserver }
    >();
    const childSlotNodes: Array<{
      width: number;
      getBoundingClientRect(): { width: number };
    }> = [];
    let hideFirstOccurrence: (() => void) | undefined;

    vi.stubGlobal(
      "ResizeObserver",
      class {
        readonly callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }

        observe(target: Element) {
          observedNodes.set(target, {
            callback: this.callback,
            observer: this as unknown as ResizeObserver,
          });
        }

        unobserve(target: Element) {
          observedNodes.delete(target);
        }

        disconnect() {
          for (const [target, registration] of observedNodes) {
            if (registration.observer === this) observedNodes.delete(target);
          }
        }
      },
    );

    const pluginDefinitions = definitions(false, false, "wide");
    const ownerDefinition = pluginDefinitions[0];
    if (ownerDefinition === undefined) {
      throw new Error("Owner Plugin fixture is missing.");
    }
    pluginDefinitions[0] = {
      ...ownerDefinition,
      Component: function MultipleOccurrenceOwner({ renderSlot }) {
        const [showFirstOccurrence, setShowFirstOccurrence] = useState(true);
        hideFirstOccurrence = () => setShowFirstOccurrence(false);
        return (
          <section>
            {showFirstOccurrence ? (
              <div key="first">{renderSlot("owner.child")}</div>
            ) : null}
            <div key="second">{renderSlot("owner.child")}</div>
          </section>
        );
      },
    };
    const pluginRegistry = createPluginRegistry(pluginDefinitions);
    const emitWidth = async (
      target: (typeof childSlotNodes)[number],
      width: number,
    ) => {
      target.width = width;
      const registration = observedNodes.get(target);
      if (registration === undefined) {
        throw new Error("Slot occurrence is not being observed.");
      }
      await act(async () => {
        registration.callback(
          [{ contentRect: { width } } as ResizeObserverEntry],
          registration.observer,
        );
        await Promise.resolve();
      });
    };
    const widthDiagnostics = () => diagnostics.filter(
      (diagnostic) => diagnostic.code === "PLUGIN_WIDTH_INCOMPATIBLE",
    );
    const childSlotWidth = () => snapshots
      .at(-1)
      ?.slots.find((slot) => slot.slotId === "owner.child")
      ?.widthClass;

    await act(async () => {
      renderer = create(
        <RuntimeFixture
          diagnosticReporter={(diagnostic) => diagnostics.push(diagnostic)}
          pluginRegistry={pluginRegistry}
          reporter={(snapshot) => snapshots.push(snapshot)}
        />,
        {
          createNodeMock: (element) => {
            const props = element.props as Record<string, unknown>;
            const node = {
              width: props["data-slot-id"] === "owner.child"
                ? 320
                : 640,
              getBoundingClientRect() {
                return { width: this.width };
              },
            };
            if (props["data-slot-id"] === "owner.child") {
              childSlotNodes.push(node);
            }
            return node;
          },
        },
      );
      await Promise.resolve();
    });

    expect(childSlotNodes).toHaveLength(2);
    expect(widthDiagnostics().map(({ status }) => status)).toEqual(["error"]);
    expect(childSlotWidth()).toBe("narrow");

    await emitWidth(childSlotNodes[0], 640);
    expect(widthDiagnostics().map(({ status }) => status)).toEqual(["error"]);
    expect(childSlotWidth()).toBe("narrow");

    await emitWidth(childSlotNodes[1], 640);
    expect(widthDiagnostics().map(({ status }) => status)).toEqual([
      "error",
      "resolved",
    ]);
    expect(childSlotWidth()).toBe("wide");

    await emitWidth(childSlotNodes[1], 320);
    expect(widthDiagnostics().map(({ status }) => status)).toEqual([
      "error",
      "resolved",
      "error",
    ]);
    expect(childSlotWidth()).toBe("narrow");

    await act(async () => {
      hideFirstOccurrence?.();
      await Promise.resolve();
    });
    expect(widthDiagnostics().map(({ status }) => status)).toEqual([
      "error",
      "resolved",
      "error",
    ]);
    expect(childSlotWidth()).toBe("narrow");
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
      application: { phase: "ready" },
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
      slots: [
        {
          slotId: "owner.child",
          widthClass: "unknown",
        },
        {
          slotId: "root-slot",
          slotPath: "root",
          widthClass: "unknown",
        },
      ],
    });
  });

  it("reports one configured instance when its child renderer has multiple React occurrences", async () => {
    const snapshots: RuntimeCompositionSnapshot[] = [];
    await act(async () => {
      renderer = create(
        <RuntimeFixture
          renderChildTwice
          reporter={(snapshot) => snapshots.push(snapshot)}
        />,
      );
      await Promise.resolve();
    });

    expect(
      snapshots
        .at(-1)
        ?.instances.filter((instance) => instance.instanceId === "child-main"),
    ).toHaveLength(1);
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
