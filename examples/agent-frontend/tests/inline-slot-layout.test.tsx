import { readFile } from "node:fs/promises";

import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { createPluginRegistry } from "../runtime/plugins";
import { resolveSlotRenderOptions } from "../runtime/plugins/UIPluginRuntime";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
};

function createModel(includeChildren: boolean) {
  return parseAppUIRuntimeModel({
    root: {
      type: "slot",
      id: "root-slot-node",
      slotId: "root-slot",
    },
    pluginInstances: {
      "owner-main": {
        id: "owner-main",
        pluginId: "owner-plugin",
        enabled: true,
        mount: { slotId: "root-slot" },
      },
      ...(includeChildren
        ? {
            "copy-main": {
              id: "copy-main",
              pluginId: "copy-plugin",
              enabled: true,
              mount: { slotId: "plugin:owner-main:actions" },
            },
            "reload-main": {
              id: "reload-main",
              pluginId: "reload-plugin",
              enabled: true,
              mount: { slotId: "plugin:owner-main:actions" },
            },
            "export-main": {
              id: "export-main",
              pluginId: "export-plugin",
              enabled: true,
              mount: { slotId: "plugin:owner-main:actions" },
            },
          }
        : {}),
    },
  });
}

function createDefinitions(layout?: "inline" | "stack"): UIPluginDefinition[] {
  return [
    {
      manifest: {
        id: "owner-plugin",
        name: "Owner Plugin",
        description: "Inline Slot owner fixture",
        version: "1.0.0",
        slots: {
          children: {
            actions: {
              description: "Inline actions.",
              cardinality: "many",
              optional: true,
            },
          },
        },
      },
      Component: ({ renderSlot }) => (
        <section>
          {renderSlot("actions", null, layout === undefined ? undefined : { layout })}
        </section>
      ),
    },
    ...(["copy", "reload", "export"] as const).map((id) => ({
      manifest: {
        id: `${id}-plugin`,
        name: `${id} Plugin`,
        description: "Inline Slot child fixture",
        version: "1.0.0",
      },
      Component: () => <button type="button">{id}</button>,
    })),
  ];
}

describe("inline child Slot layout", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    if (renderer !== undefined) {
      await act(async () => renderer?.unmount());
    }
    renderer = undefined;
  });

  it("keeps inline children ordered in one content-sized outlet", async () => {
    await act(async () => {
      renderer = create(
        <PluginRuntimeFixture
          actions={runtimeActions}
          appUIModelHash={"i".repeat(64)}
          conversation={{ id: "inline-slot" }}
          executions={[]}
          interrupts={[]}
          messages={[]}
          model={createModel(true)}
          registry={createPluginRegistry(createDefinitions("inline"))}
          run={{ status: "idle" }}
          state={null}
        />,
      );
      await Promise.resolve();
    });

    const probe = renderer!.root.findByProps({
      className: "app-ui-plugin-slot-width-probe",
    });
    const content = renderer!.root.findByProps({
      className: "app-ui-plugin-slot-content",
    });
    expect(probe.props["data-slot-layout"]).toBe("inline");
    expect(probe.props["data-slot-sizing"]).toBe("content");
    expect(content.props["data-slot-layout"]).toBe("inline");
    expect(
      renderer!.root
        .findAllByProps({ className: "app-ui-plugin-instance" })
        .filter((node) => node.props["data-plugin-instance-id"] !== "owner-main")
        .map((node) => node.props["data-plugin-instance-id"]),
    ).toEqual(["copy-main", "reload-main", "export-main"]);
  });

  it("keeps the default stack layout and an empty inline Slot dimensionless", async () => {
    await act(async () => {
      renderer = create(
        <PluginRuntimeFixture
          actions={runtimeActions}
          appUIModelHash={"i".repeat(64)}
          conversation={{ id: "inline-slot" }}
          executions={[]}
          interrupts={[]}
          messages={[]}
          model={createModel(false)}
          registry={createPluginRegistry(createDefinitions("inline"))}
          run={{ status: "idle" }}
          state={null}
        />,
      );
      await Promise.resolve();
    });

    const inlineProbe = renderer!.root.findByProps({
      className: "app-ui-plugin-slot-width-probe",
    });
    expect(inlineProbe.props["data-slot-layout"]).toBe("inline");
    expect(inlineProbe.props.children == null).toBe(true);

    await act(async () => {
      renderer?.unmount();
      renderer = create(
        <PluginRuntimeFixture
          actions={runtimeActions}
          appUIModelHash={"s".repeat(64)}
          conversation={{ id: "stack-slot" }}
          executions={[]}
          interrupts={[]}
          messages={[]}
          model={createModel(true)}
          registry={createPluginRegistry(createDefinitions("stack"))}
          run={{ status: "idle" }}
          state={null}
        />,
      );
      await Promise.resolve();
    });
    expect(
      renderer!.root.findByProps({ className: "app-ui-plugin-slot-width-probe" })
        .props["data-slot-layout"],
    ).toBe("stack");
  });

  it("rejects inline Slots that request fill sizing", () => {
    expect(() =>
      resolveSlotRenderOptions({ layout: "inline", sizing: "fill" }),
    ).toThrow("inline Slot cannot use fill sizing");
  });

  it("documents the inline width and overflow contract in Runtime CSS", async () => {
    const styles = await readFile(
      new URL("../runtime/plugins/plugin-runtime.css", import.meta.url),
      "utf8",
    );
    expect(styles).toContain('[data-slot-layout="inline"]');
    expect(styles).toContain("display: inline-flex;");
    expect(styles).toContain("overflow: visible;");
    expect(styles).toContain("width: auto;");
  });
});
