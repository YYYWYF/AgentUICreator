import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import {
  createPluginCapabilityCatalog,
  createRuntimeCompositionStore,
  type RuntimeCompositionStore,
} from "../runtime/composition";

function definition(pluginId: string): UIPluginDefinition {
  return {
    manifest: {
      id: pluginId,
      name: pluginId,
      description: `${pluginId} fixture`,
      version: "1.0.0",
    },
    Component: () => null,
  };
}

function catalog(
  pluginIds: readonly string[],
  failingPluginId?: string,
) {
  return createPluginCapabilityCatalog(pluginIds.map((pluginId) => ({
    manifest: definition(pluginId).manifest,
    provides: [],
    inject: [],
    optionalInject: [],
    loadDefinition: failingPluginId === pluginId
      ? () => Promise.reject(new Error(`${pluginId} implementation failed`))
      : () => Promise.resolve(definition(pluginId)),
  })));
}

function modelSource(pluginIds: readonly string[]): string {
  return `${JSON.stringify({
    root: {
      type: "slot",
      plugins: pluginIds.map((pluginId) => ({
        id: `${pluginId}-main`,
        pluginId,
        enabled: true,
      })),
    },
  })}\n`;
}

function hash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function waitForPublish(store: RuntimeCompositionStore): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = store.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
}

function waitForError(store: RuntimeCompositionStore): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = store.subscribeDiagnostics(() => {
      if (store.getCandidateDiagnostic()?.status !== "error") return;
      unsubscribe();
      resolve();
    });
  });
}

async function publishInitial(
  store: RuntimeCompositionStore,
  source = modelSource(["alpha"]),
  pluginIds: readonly string[] = ["alpha"],
): Promise<void> {
  const published = waitForPublish(store);
  store.stageCandidate({
    appUIModelSource: source,
    capabilityCatalog: catalog(pluginIds),
    capabilityCatalogRevision: "a".repeat(64),
  });
  await published;
}

describe("RuntimeCompositionStore", () => {
  it("keeps the published snapshot when a model arrives before its capability", async () => {
    const store = createRuntimeCompositionStore();
    const publishListener = vi.fn();
    store.subscribe(publishListener);
    await publishInitial(store);
    const published = store.getSnapshot();
    const nextSource = modelSource(["alpha", "beta"]);
    const failed = waitForError(store);

    store.stageCandidate({
      appUIModelSource: nextSource,
      capabilityCatalog: catalog(["alpha"]),
      capabilityCatalogRevision: "a".repeat(64),
    });
    await failed;

    expect(store.getSnapshot()).toBe(published);
    const republished = waitForPublish(store);
    store.stageCandidate({
      appUIModelSource: nextSource,
      capabilityCatalog: catalog(["alpha", "beta"]),
      capabilityCatalogRevision: "b".repeat(64),
    });
    await republished;
    expect(Object.keys(store.getSnapshot()!.runtimeModel.pluginInstances)).toEqual([
      "alpha-main",
      "beta-main",
    ]);
    expect(publishListener).toHaveBeenCalledTimes(2);
  });

  it("uses a descriptor to suppress catalog-first intermediate publication", async () => {
    const store = createRuntimeCompositionStore();
    const publishListener = vi.fn();
    store.subscribe(publishListener);
    await publishInitial(store);
    const nextSource = modelSource(["alpha", "beta"]);
    const revision = "b".repeat(64);
    const descriptor = JSON.stringify({
      transactionId: "transaction-beta",
      appUIModelHash: hash(nextSource),
      capabilityCatalogRevision: revision,
    });

    store.stageCandidate({
      appUIModelSource: modelSource(["alpha"]),
      capabilityCatalog: catalog(["alpha"]),
      capabilityCatalogRevision: "a".repeat(64),
      revisionDescriptorSource: descriptor,
    });
    store.stageCandidate({
      appUIModelSource: modelSource(["alpha"]),
      capabilityCatalog: catalog(["alpha", "beta"]),
      capabilityCatalogRevision: revision,
      revisionDescriptorSource: descriptor,
    });

    const republished = waitForPublish(store);
    store.stageCandidate({
      appUIModelSource: nextSource,
      capabilityCatalog: catalog(["alpha", "beta"]),
      capabilityCatalogRevision: revision,
      revisionDescriptorSource: descriptor,
    });
    await republished;

    expect(store.getSnapshot()).toMatchObject({
      revision: "transaction-beta",
      transactionId: "transaction-beta",
      capabilityCatalogRevision: revision,
    });
    expect(publishListener).toHaveBeenCalledTimes(2);
  });

  it("keeps last-known-good when a selected implementation cannot load", async () => {
    const store = createRuntimeCompositionStore();
    await publishInitial(store);
    const published = store.getSnapshot();
    const failed = waitForError(store);

    store.stageCandidate({
      appUIModelSource: modelSource(["alpha", "broken"]),
      capabilityCatalog: catalog(["alpha", "broken"], "broken"),
      capabilityCatalogRevision: "c".repeat(64),
    });
    await failed;

    expect(store.getSnapshot()).toBe(published);
    expect(store.getCandidateDiagnostic()?.errorMessage).toContain(
      "broken implementation failed",
    );
  });

  it("reports a Data Message UI name conflict without publishing the candidate", async () => {
    const store = createRuntimeCompositionStore();
    const dataMessageDefinitions: UIPluginDefinition[] = ["first", "second"].map((pluginId) => ({
      manifest: {
        id: pluginId,
        name: pluginId,
        description: `${pluginId} fixture`,
        version: "1.0.0",
        data: { messageUI: true },
      },
      dataMessageUIs: [{ name: "chart", render: () => null }],
      Component: () => null,
    }));
    const capabilityCatalog = createPluginCapabilityCatalog(dataMessageDefinitions.map((plugin) => ({
      manifest: plugin.manifest,
      provides: [],
      inject: [],
      optionalInject: [],
      loadDefinition: async () => plugin,
    })));
    const failed = waitForError(store);
    store.stageCandidate({
      appUIModelSource: JSON.stringify({
        applicationPlugins: dataMessageDefinitions.map((plugin) => ({
          id: `${plugin.manifest.id}-main`,
          pluginId: plugin.manifest.id,
          enabled: true,
        })),
        root: { type: "slot", plugins: [] },
      }),
      capabilityCatalog,
      capabilityCatalogRevision: "a".repeat(64),
    });
    await failed;

    expect(store.getSnapshot()).toBeUndefined();
    expect(store.getCandidateDiagnostic()).toMatchObject({
      status: "error",
      errorMessage: expect.stringContaining("DATA_MESSAGE_UI_NAME_CONFLICT"),
    });
  });

  it("publishes a capability removal only after the descriptor target is complete", async () => {
    const store = createRuntimeCompositionStore();
    const initialSource = modelSource(["alpha", "beta"]);
    await publishInitial(store, initialSource, ["alpha", "beta"]);
    const nextSource = modelSource(["alpha"]);
    const revision = "d".repeat(64);
    const descriptor = JSON.stringify({
      transactionId: "transaction-remove-beta",
      appUIModelHash: hash(nextSource),
      capabilityCatalogRevision: revision,
    });

    store.stageCandidate({
      appUIModelSource: initialSource,
      capabilityCatalog: catalog(["alpha"]),
      capabilityCatalogRevision: revision,
      revisionDescriptorSource: descriptor,
    });
    const republished = waitForPublish(store);
    store.stageCandidate({
      appUIModelSource: nextSource,
      capabilityCatalog: catalog(["alpha"]),
      capabilityCatalogRevision: revision,
      revisionDescriptorSource: descriptor,
    });
    await republished;

    expect(Object.keys(store.getSnapshot()!.runtimeModel.pluginInstances)).toEqual([
      "alpha-main",
    ]);
  });

  it("does not let an async stale candidate replace the latest publication", async () => {
    const store = createRuntimeCompositionStore();
    await publishInitial(store);
    let resolveSlowDefinition!: (definition: UIPluginDefinition) => void;
    let markSlowLoaderStarted!: () => void;
    const slowLoaderStarted = new Promise<void>((resolve) => {
      markSlowLoaderStarted = resolve;
    });
    const slowDefinition = new Promise<UIPluginDefinition>((resolve) => {
      resolveSlowDefinition = resolve;
    });
    const slowCatalog = createPluginCapabilityCatalog([
      {
        manifest: definition("alpha").manifest,
        provides: [],
        inject: [],
        optionalInject: [],
        loadDefinition: () => Promise.resolve(definition("alpha")),
      },
      {
        manifest: definition("beta").manifest,
        provides: [],
        inject: [],
        optionalInject: [],
        loadDefinition: () => {
          markSlowLoaderStarted();
          return slowDefinition;
        },
      },
    ]);

    store.stageCandidate({
      appUIModelSource: modelSource(["alpha", "beta"]),
      capabilityCatalog: slowCatalog,
      capabilityCatalogRevision: "b".repeat(64),
    });
    await slowLoaderStarted;

    const latestPublished = waitForPublish(store);
    store.stageCandidate({
      appUIModelSource: modelSource(["alpha", "gamma"]),
      capabilityCatalog: catalog(["alpha", "gamma"]),
      capabilityCatalogRevision: "c".repeat(64),
    });
    await latestPublished;
    const latestSnapshot = store.getSnapshot();

    resolveSlowDefinition(definition("beta"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getSnapshot()).toBe(latestSnapshot);
    expect(Object.keys(store.getSnapshot()!.runtimeModel.pluginInstances)).toEqual([
      "alpha-main",
      "gamma-main",
    ]);
  });
});
