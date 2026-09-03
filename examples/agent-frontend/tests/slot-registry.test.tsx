import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  PluginServiceRuntimeContext,
  SlotRegistry,
  UIPluginRuntime,
} from "../runtime/plugins";

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

describe("SlotRegistry declarations", () => {
  it("registers and exposes a live declaration", () => {
    const slots = new SlotRegistry();
    const declaration = {
      slotId: "messages",
      owner: { kind: "layout" as const, nodeId: "messages-node" },
    };

    slots.declare(declaration);

    expect(slots.getDeclaration("messages")).toEqual(declaration);
  });

  it("removes a declaration through its disposer", () => {
    const slots = new SlotRegistry();
    const dispose = slots.declare({
      slotId: "messages",
      owner: { kind: "layout", nodeId: "messages-node" },
    });

    dispose();

    expect(slots.getDeclaration("messages")).toBeUndefined();
  });

  it("rejects duplicate live declarations without replacing the owner", () => {
    const slots = new SlotRegistry();
    const first = {
      slotId: "messages",
      owner: { kind: "layout" as const, nodeId: "owner-a" },
    };
    slots.declare(first);

    expect(() =>
      slots.declare({
        slotId: "messages",
        owner: { kind: "layout", nodeId: "owner-b" },
      }),
    ).toThrow('Slot "messages" already has a live declaration');
    expect(slots.getDeclaration("messages")).toEqual(first);
  });

  it("does not let a stale disposer remove a newer declaration", () => {
    const slots = new SlotRegistry();
    const disposeFirst = slots.declare({
      slotId: "messages",
      owner: { kind: "layout", nodeId: "owner-a" },
    });
    disposeFirst();
    const second = {
      slotId: "messages",
      owner: { kind: "layout" as const, nodeId: "owner-b" },
    };
    slots.declare(second);

    disposeFirst();

    expect(slots.getDeclaration("messages")).toEqual(second);
  });

  it("notifies the existing subscription on declare and undeclare", () => {
    const slots = new SlotRegistry();
    const listener = vi.fn();
    slots.subscribe(listener);

    const dispose = slots.declare({
      slotId: "messages",
      owner: { kind: "layout", nodeId: "messages-node" },
    });
    expect(listener).toHaveBeenCalledTimes(1);

    dispose();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("Layout Slot declarations", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    renderer = undefined;
  });

  afterEach(async () => {
    if (renderer !== undefined) {
      await act(async () => renderer?.unmount());
    }
  });

  it("binds a mounted Layout SlotNode to declaration lifetime", async () => {
    const serviceRuntime = new PluginServiceRuntime();
    const model = parseAppUIModel({
      version: "2",
      root: {
        type: "slot",
        id: "messages-node",
        slotId: "messages",
      },
      pluginInstances: {},
    });

    await act(async () => {
      renderer = create(
        <PluginServiceRuntimeContext.Provider value={serviceRuntime}>
          <UIPluginRuntime
            actions={runtimeActions}
            messages={[]}
            model={model}
            registry={createPluginRegistry([])}
            run={{ status: "idle", errorMessage: undefined }}
            state={null}
          />
        </PluginServiceRuntimeContext.Provider>,
      );
    });

    expect(serviceRuntime.slots.getDeclaration("messages")).toEqual({
      slotId: "messages",
      owner: { kind: "layout", nodeId: "messages-node" },
    });

    await act(async () => renderer?.unmount());
    renderer = undefined;

    expect(serviceRuntime.slots.getDeclaration("messages")).toBeUndefined();
  });
});
