import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  CREATOR_RUNTIME_COMPOSITION_SCHEMA_VERSION,
  CREATOR_RUNTIME_DIAGNOSTIC_SCHEMA_VERSION,
  CreatorRuntimeDiagnosticSession,
  CreatorRuntimeDiagnosticStore,
  createCreatorProjectTools,
  createRuntimeCompositionTool,
  createRuntimeDiagnosticTool,
  loadProjectSnapshot,
  type CreatorRuntimeDiagnostic,
  type CreatorRuntimeComposition,
  type ProjectControlAdapter,
  type UIProjectInspection,
} from "../src/index.js";
import { handleCreatorRuntimeDiagnosticRequest } from "../src/vitePlugin.js";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function diagnostic(
  overrides: Partial<CreatorRuntimeDiagnostic> = {},
): CreatorRuntimeDiagnostic {
  return {
    schemaVersion: CREATOR_RUNTIME_DIAGNOSTIC_SCHEMA_VERSION,
    kind: "plugin-render",
    status: "error",
    appUIModelHash: hashA,
    occurredAt: "2026-09-02T04:00:00.000Z",
    pluginId: "conversation-history",
    instanceId: "history-main",
    pluginName: "Conversation History",
    slotId: "history",
    slotPath: "root.child",
    errorMessage: "History render failed.",
    componentStack: "at ConversationHistory",
    ...overrides,
  };
}

function composition(
  overrides: Partial<CreatorRuntimeComposition> = {},
): CreatorRuntimeComposition {
  return {
    schemaVersion: CREATOR_RUNTIME_COMPOSITION_SCHEMA_VERSION,
    appUIModelHash: hashA,
    observedAt: "2026-09-02T04:00:01.000Z",
    instances: [
      {
        instanceId: "history-main",
        pluginId: "conversation-history",
        slotId: "history",
        slotPath: "root",
      },
    ],
    ...overrides,
  };
}

function inspectionFixture(hash = hashA): UIProjectInspection {
  return {
    schemaVersion: 2,
    appUIModel: {
      hash,
      version: "2",
      layout: {
        type: "slot",
        id: "history-slot-node",
        slotId: "history",
      },
      slots: [
        {
          slotId: "history",
          nodeId: "history-slot-node",
          nodePath: "root",
          mounts: [
            {
              instanceId: "history-main",
              pluginId: "conversation-history",
              enabled: true,
            },
          ],
        },
      ],
    },
    pluginInstances: [
      {
        id: "history-main",
        pluginId: "conversation-history",
        enabled: true,
        mount: { slotId: "history" },
        mountedSlotId: "history",
      },
    ],
    registry: {
      selectedPluginIds: ["conversation-history"],
      registeredPluginIds: ["conversation-history"],
      generatedFileFresh: true,
      issues: [],
    },
    pluginAssets: [],
    catalogs: [],
    uiStack: [{ packageName: "react", version: "19.2.8" }],
  };
}

describe("Creator runtime diagnostics", () => {
  it("deduplicates repeated errors and preserves resolved audit state", () => {
    const store = new CreatorRuntimeDiagnosticStore();

    store.record("project-a", "thread-a", diagnostic());
    store.record("project-a", "thread-a", diagnostic());

    const failed = store.inspect("project-a", "thread-a", hashA);
    expect(failed.currentErrors).toHaveLength(1);
    expect(failed.currentErrors[0]).toMatchObject({
      count: 2,
      status: "error",
      stale: false,
    });

    const result = store.record(
      "project-a",
      "thread-a",
      diagnostic({ status: "resolved", errorMessage: undefined }),
    );
    expect(result.resolvedCount).toBe(1);
    const resolved = store.inspect("project-a", "thread-a", hashA);
    expect(resolved.currentErrors).toHaveLength(0);
    expect(resolved.resolvedCurrent).toHaveLength(1);
    expect(resolved.resolvedCurrent[0]).toMatchObject({
      count: 2,
      status: "resolved",
    });
  });

  it("isolates projects and threads and treats other AppUIModel hashes as stale", () => {
    const store = new CreatorRuntimeDiagnosticStore();
    store.record("project-a", "thread-a", diagnostic());

    expect(
      store.inspect("project-a", "thread-b", hashA).currentErrors,
    ).toHaveLength(0);
    expect(
      store.inspect("project-b", "thread-a", hashA).currentErrors,
    ).toHaveLength(0);

    const currentHashChanged = store.inspect(
      "project-a",
      "thread-a",
      hashB,
      { includeStale: true },
    );
    expect(currentHashChanged.currentErrors).toHaveLength(0);
    expect(currentHashChanged.stale).toHaveLength(1);
    expect(currentHashChanged.stale[0]).toMatchObject({
      appUIModelHash: hashA,
      stale: true,
    });
    expect(currentHashChanged.summary.staleOpenCount).toBe(1);
  });

  it("exposes only source-attributed diagnostics through the tool and snapshot", async () => {
    const store = new CreatorRuntimeDiagnosticStore();
    const session = new CreatorRuntimeDiagnosticSession(store, "project-a");
    session.beginThread("thread-a");
    store.record("project-a", "thread-a", diagnostic());
    const request = vi.fn(async () => inspectionFixture());
    const adapter = { request } as unknown as ProjectControlAdapter;

    const runtimeTool = createRuntimeDiagnosticTool(adapter, session);
    const rawResult = await (
      runtimeTool as unknown as {
        invoke(input: { includeStale?: boolean | undefined }): Promise<unknown>;
      }
    ).invoke({});
    const result = JSON.parse(String(rawResult)) as {
      ok: boolean;
      result: {
        currentErrors: CreatorRuntimeDiagnostic[];
        stale: CreatorRuntimeDiagnostic[];
      };
    };
    expect(result.ok).toBe(true);
    expect(result.result.currentErrors).toHaveLength(1);
    expect(result.result.stale).toHaveLength(0);

    const tools = createCreatorProjectTools(adapter, undefined, session);
    expect(tools.map((candidate) => candidate.name)).toContain(
      "inspect_runtime_errors",
    );
    expect(tools.map((candidate) => candidate.name)).toContain(
      "inspect_runtime_composition",
    );

    const snapshot = await loadProjectSnapshot(adapter, undefined, session);
    expect(snapshot.creator.runtimeDiagnostics).toMatchObject({
      available: true,
      currentOpenCount: 1,
      staleOpenCount: 0,
    });
  });

  it("stores bounded composition facts and distinguishes synced, stale, and unavailable runtimes", () => {
    const store = new CreatorRuntimeDiagnosticStore();
    expect(
      store.inspectComposition("project-a", "thread-a", hashA),
    ).toMatchObject({ runtimeStatus: "unavailable", synchronized: false });

    store.recordComposition("project-a", "thread-a", composition());
    expect(
      store.inspectComposition("project-a", "thread-a", hashA),
    ).toMatchObject({
      runtimeStatus: "synced",
      synchronized: true,
      runtimeAppUIModelHash: hashA,
      instances: [
        {
          instanceId: "history-main",
          pluginId: "conversation-history",
          slotId: "history",
        },
      ],
    });
    expect(
      store.inspectComposition("project-a", "thread-a", hashB),
    ).toMatchObject({
      runtimeStatus: "stale",
      synchronized: false,
      runtimeAppUIModelHash: hashA,
    });
  });

  it("deterministically verifies mount, identity, Slot, unmount, and target runtime errors", async () => {
    const store = new CreatorRuntimeDiagnosticStore();
    const session = new CreatorRuntimeDiagnosticSession(store, "project-a");
    session.beginThread("thread-a");
    store.recordComposition("project-a", "thread-a", composition());
    const adapter = {
      request: vi.fn(async () => inspectionFixture()),
    } as unknown as ProjectControlAdapter;
    const runtimeTool = createRuntimeCompositionTool(adapter, session) as unknown as {
      invoke(input: Record<string, unknown>): Promise<unknown>;
    };

    const invoke = async (expect: Array<Record<string, unknown>>) =>
      JSON.parse(String(await runtimeTool.invoke({ expect, waitForSyncMs: 0 }))) as {
        result: {
          checks: Array<{ status: string }>;
          verificationPassed: boolean;
        };
      };

    expect(
      await invoke([
        {
          instanceId: "history-main",
          pluginId: "conversation-history",
          slotId: "history",
        },
      ]),
    ).toMatchObject({
      result: { checks: [{ status: "passed" }], verificationPassed: true },
    });
    expect(
      await invoke([{ instanceId: "history-main", slotId: "other" }]),
    ).toMatchObject({
      result: {
        checks: [{ status: "slot-mismatch" }],
        verificationPassed: false,
      },
    });
    expect(
      await invoke([{ instanceId: "history-main", pluginId: "other" }]),
    ).toMatchObject({
      result: {
        checks: [{ status: "plugin-mismatch" }],
        verificationPassed: false,
      },
    });
    expect(
      await invoke([{ instanceId: "history-main", mounted: false }]),
    ).toMatchObject({
      result: {
        checks: [{ status: "unexpectedly-mounted" }],
        verificationPassed: false,
      },
    });
    expect(
      await invoke([{ instanceId: "missing-main" }]),
    ).toMatchObject({
      result: {
        checks: [{ status: "missing" }],
        verificationPassed: false,
      },
    });
    expect(
      await invoke([{ instanceId: "missing-main", mounted: false }]),
    ).toMatchObject({
      result: { checks: [{ status: "passed" }], verificationPassed: true },
    });

    store.record("project-a", "thread-a", diagnostic());
    expect(
      await invoke([{ instanceId: "history-main" }]),
    ).toMatchObject({
      result: {
        checks: [{ status: "runtime-error" }],
        verificationPassed: false,
      },
    });
  });

  it("does not report verificationPassed when no expectations were provided", async () => {
    const store = new CreatorRuntimeDiagnosticStore();
    const session = new CreatorRuntimeDiagnosticSession(store, "project-a");
    session.beginThread("thread-a");
    store.recordComposition("project-a", "thread-a", composition());
    const adapter = {
      request: vi.fn(async () => inspectionFixture()),
    } as unknown as ProjectControlAdapter;
    const runtimeTool = createRuntimeCompositionTool(adapter, session) as unknown as {
      invoke(input: Record<string, unknown>): Promise<unknown>;
    };

    const result = JSON.parse(
      String(await runtimeTool.invoke({ waitForSyncMs: 0 })),
    );

    expect(result.result).toMatchObject({
      synchronized: true,
      checks: [],
      verificationPerformed: false,
      verificationPassed: false,
    });
  });

  it("does not evaluate expectations against stale or unavailable runtime state", async () => {
    const adapter = {
      request: vi.fn(async () => inspectionFixture(hashB)),
    } as unknown as ProjectControlAdapter;
    const unavailableSession = new CreatorRuntimeDiagnosticSession(
      new CreatorRuntimeDiagnosticStore(),
      "project-a",
    );
    unavailableSession.beginThread("thread-a");
    const unavailableTool = createRuntimeCompositionTool(
      adapter,
      unavailableSession,
    ) as unknown as {
      invoke(input: Record<string, unknown>): Promise<unknown>;
    };
    const unavailable = JSON.parse(
      String(
        await unavailableTool.invoke({
          expect: [{ instanceId: "history-main" }],
          waitForSyncMs: 0,
        }),
      ),
    );
    expect(unavailable.result).toMatchObject({
      runtimeStatus: "unavailable",
      checks: [{ status: "not-evaluated" }],
      verificationPassed: false,
    });

    const staleStore = new CreatorRuntimeDiagnosticStore();
    staleStore.recordComposition("project-a", "thread-a", composition());
    const staleSession = new CreatorRuntimeDiagnosticSession(
      staleStore,
      "project-a",
    );
    staleSession.beginThread("thread-a");
    const staleTool = createRuntimeCompositionTool(
      adapter,
      staleSession,
    ) as unknown as {
      invoke(input: Record<string, unknown>): Promise<unknown>;
    };
    const stale = JSON.parse(
      String(
        await staleTool.invoke({
          expect: [{ instanceId: "missing-main" }],
          waitForSyncMs: 0,
        }),
      ),
    );
    expect(stale.result).toMatchObject({
      runtimeStatus: "stale",
      checks: [{ status: "not-evaluated" }],
      verificationPassed: false,
    });
  });

  it("rejects anonymous and oversized diagnostic payloads", () => {
    const store = new CreatorRuntimeDiagnosticStore();
    expect(() =>
      store.record("project-a", "thread-a", {
        ...diagnostic(),
        pluginId: "",
      }),
    ).toThrow(/pluginId/u);
    expect(() =>
      store.record("project-a", "thread-a", {
        ...diagnostic(),
        errorMessage: "x".repeat(2_001),
      }),
    ).toThrow(/errorMessage/u);
  });

  it("accepts bounded reporter payloads through the dedicated Vite endpoint", async () => {
    const store = new CreatorRuntimeDiagnosticStore();
    const request = Readable.from([
      Buffer.from(
        JSON.stringify({
          threadId: "thread-a",
          diagnostic: diagnostic(),
        }),
      ),
    ]) as IncomingMessage;
    request.method = "POST";
    let responseBody = "";
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end(value?: string) {
        responseBody = value ?? "";
      },
    } as unknown as ServerResponse;

    await handleCreatorRuntimeDiagnosticRequest(
      request,
      response,
      store,
      "project-a",
    );

    expect(response.statusCode).toBe(202);
    expect(JSON.parse(responseBody)).toMatchObject({ accepted: true });
    expect(
      store.inspect("project-a", "thread-a", hashA).currentErrors,
    ).toHaveLength(1);
  });

  it("accepts composition on the diagnostic endpoint and enforces XOR payloads", async () => {
    const store = new CreatorRuntimeDiagnosticStore();
    const request = Readable.from([
      Buffer.from(
        JSON.stringify({
          threadId: "thread-a",
          composition: composition(),
        }),
      ),
    ]) as IncomingMessage;
    request.method = "POST";
    let responseBody = "";
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end(value?: string) {
        responseBody = value ?? "";
      },
    } as unknown as ServerResponse;

    await handleCreatorRuntimeDiagnosticRequest(
      request,
      response,
      store,
      "project-a",
    );
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(responseBody)).toMatchObject({ accepted: true });
    expect(
      store.inspectComposition("project-a", "thread-a", hashA),
    ).toMatchObject({ runtimeStatus: "synced" });

    const invalidRequest = Readable.from([
      Buffer.from(
        JSON.stringify({
          threadId: "thread-a",
          diagnostic: diagnostic(),
          composition: composition(),
        }),
      ),
    ]) as IncomingMessage;
    invalidRequest.method = "POST";
    const invalidResponse = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    await handleCreatorRuntimeDiagnosticRequest(
      invalidRequest,
      invalidResponse,
      store,
      "project-a",
    );
    expect(invalidResponse.statusCode).toBe(400);
  });
});
