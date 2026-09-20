import { createContext, useContext, useEffect, useMemo } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import type { UIPluginComponentProps, UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { createPluginRegistry, usePluginRenderScope } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const actions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
};
let ownerMounts = 0;
const RuntimeStatusContext = createContext("running");

function Owner({ renderScopedSlot }: UIPluginComponentProps) {
  const status = useContext(RuntimeStatusContext);
  useEffect(() => { ownerMounts += 1; }, []);
  return <section>
    {renderScopedSlot("entity", { kind: "sample.entity", value: { label: "A", status } })}
    {renderScopedSlot("entity", { kind: "sample.entity", value: { label: "B", status } })}
  </section>;
}

const definitions: UIPluginDefinition[] = [
  {
    manifest: {
      id: "owner", name: "Owner", description: "Scoped host fixture", version: "1.0.0",
      slots: { children: { entity: {
        description: "One scoped renderer", cardinality: "one", mode: "renderer", optional: true,
        accepts: { anyOfCapabilities: ["entity-renderer"] },
      } } },
    },
    Component: Owner,
  },
  ...(["renderer-a", "renderer-b"] as const).map((id): UIPluginDefinition => ({
    manifest: {
      id, name: id, description: "Scoped renderer fixture", version: "1.0.0",
      capabilities: ["entity-renderer"], requiresRenderScope: true,
    },
    Component: () => {
      const scope = usePluginRenderScope<{ label: string; status: string }>();
      return scope?.kind === "sample.entity"
        ? <strong>{`${id}:${scope.value.label}:${scope.value.status}`}</strong>
        : null;
    },
  })),
];
const registry = createPluginRegistry(definitions);

function model(rendererId: string | null, enabled = true) {
  return parseAppUIRuntimeModel({
    root: { type: "slot", id: "root", slotId: "root-slot" },
    pluginInstances: {
      owner: { id: "owner", pluginId: "owner", enabled: true, mount: { slotId: "root-slot" } },
      ...(rendererId === null ? {} : {
        renderer: {
          id: "renderer", pluginId: rendererId, enabled,
          mount: { slotId: "plugin:owner:entity" },
        },
      }),
    },
  });
}

function Fixture({ rendererId, enabled = true, status = "running" }: {
  rendererId: string | null; enabled?: boolean; status?: string;
}) {
  const runtimeModel = useMemo(() => model(rendererId, enabled), [rendererId, enabled]);
  return <RuntimeStatusContext.Provider value={status}><PluginRuntimeFixture
    actions={actions} conversation={{ id: "scoped-test" }} executions={[]} interrupts={[]}
    messages={[]} model={runtimeModel} registry={registry}
    run={{ status: "idle" }} state={null}
  /></RuntimeStatusContext.Provider>;
}

describe("scoped renderer runtime composition", () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    ownerMounts = 0;
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    if (renderer !== undefined) await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it("uses the same Plugin instance with isolated scopes for repeated entities", async () => {
    await act(async () => {
      renderer = create(<Fixture rendererId="renderer-a" />);
      await Promise.resolve();
    });
    expect(renderer!.root.findAllByType("strong").map((node) => node.children.join("")))
      .toEqual(["renderer-a:A:running", "renderer-a:B:running"]);
  });

  it("renders nothing when an optional Renderer Slot has no occupant", async () => {
    await act(async () => {
      renderer = create(<Fixture rendererId={null} />);
      await Promise.resolve();
    });
    expect(renderer!.root.findAllByType("section")).toHaveLength(1);
    expect(renderer!.root.findAllByType("strong")).toHaveLength(0);
  });

  it("renders nothing for disabled and removed instances and replaces a renderer through the model", async () => {
    await act(async () => {
      renderer = create(<Fixture rendererId="renderer-a" />);
      await Promise.resolve();
    });
    await act(async () => renderer!.update(<Fixture rendererId="renderer-a" enabled={false} />));
    expect(renderer!.root.findAllByType("strong")).toHaveLength(0);
    await act(async () => renderer!.update(<Fixture rendererId={null} />));
    expect(renderer!.root.findAllByType("strong")).toHaveLength(0);
    await act(async () => renderer!.update(<Fixture rendererId="renderer-b" />));
    expect(renderer!.root.findAllByType("strong").map((node) => node.children.join("")))
      .toEqual(["renderer-b:A:running", "renderer-b:B:running"]);
    expect(ownerMounts).toBe(1);
  });

  it("updates running status without remounting the structural host", async () => {
    await act(async () => {
      renderer = create(<Fixture rendererId="renderer-a" status="running" />);
      await Promise.resolve();
    });
    await act(async () => renderer!.update(<Fixture rendererId="renderer-a" status="complete" />));
    expect(renderer!.root.findAllByType("strong").map((node) => node.children.join("")))
      .toEqual(["renderer-a:A:complete", "renderer-a:B:complete"]);
    expect(ownerMounts).toBe(1);
  });
});
