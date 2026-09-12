// @vitest-environment jsdom

import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { mockAuthLoginPlugin } from "../plugins/mock-auth-login/definition";
import {
  createMockAuthController,
  MOCK_AUTH_STORAGE_KEY,
  type MockAuthStorage,
} from "../plugins/mock-auth-login/mock-auth-controller";
import {
  createPluginRegistry,
  PluginServiceRuntime,
  UIPluginRuntime,
  usePluginService,
} from "../runtime/plugins";
import {
  AUTH_SESSION_SERVICE,
  type AuthSession,
  type AuthSessionService,
} from "../services/auth-session";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const runtimeActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
  updateInstanceProps: vi.fn(),
};

class MemoryStorage implements MockAuthStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function definition(
  id: string,
  options: {
    headless?: boolean;
    inject?: readonly string[];
    setup?: UIPluginDefinition["setup"];
    Component?: UIPluginDefinition["Component"];
  } = {},
): UIPluginDefinition {
  return {
    manifest: {
      id,
      name: id,
      description: `${id} fixture`,
      version: "1.0.0",
      ...(options.headless ? { capabilities: ["headless"] } : {}),
    },
    ...(options.inject === undefined ? {} : { inject: options.inject }),
    ...(options.setup === undefined ? {} : { setup: options.setup }),
    Component: options.Component ?? (() => null),
  };
}

function WorkspaceWithLogout() {
  const auth = usePluginService<AuthSessionService>(AUTH_SESSION_SERVICE);

  return (
    <button data-test-workspace onClick={() => auth?.logout()} type="button">
      Logout
    </button>
  );
}

function createAuthModel() {
  return parseAppUIModel({
    version: "2",
    root: { type: "slot", id: "main-node", slotId: "main" },
    pluginInstances: {
      "mock-auth-login-main": {
        id: "mock-auth-login-main",
        pluginId: "mock-auth-login",
        enabled: true,
      },
      "workspace-main": {
        id: "workspace-main",
        pluginId: "workspace",
        enabled: true,
        mount: { slotId: "main" },
      },
      "telemetry-main": {
        id: "telemetry-main",
        pluginId: "telemetry",
        enabled: true,
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mock auth controller", () => {
  it("starts checking and blocks when no local session exists", () => {
    const controller = createMockAuthController(new MemoryStorage());
    const checkingSnapshot = controller.gate.getSnapshot();

    expect(checkingSnapshot).toEqual({ status: "checking" });
    expect(controller.gate.getSnapshot()).toBe(checkingSnapshot);

    controller.initialize();

    expect(controller.gate.getSnapshot()).toEqual({ status: "blocked" });
    expect(controller.session.getSnapshot()).toEqual({ authenticated: false });
  });

  it("logs in with a mock session and persists no credential data", () => {
    const storage = new MemoryStorage();
    const controller = createMockAuthController(storage);
    controller.initialize();

    controller.session.login({ email: "person@example.com" });

    const persisted = JSON.parse(
      storage.getItem(MOCK_AUTH_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown>;
    expect(controller.gate.getSnapshot()).toEqual({ status: "ready" });
    expect(controller.session.getSnapshot()).toMatchObject({
      authenticated: true,
      session: {
        userId: "demo-user",
        displayName: "Demo User",
        email: "person@example.com",
      },
    });
    expect(Object.keys(persisted).sort()).toEqual([
      "displayName",
      "email",
      "loggedInAt",
      "userId",
    ]);
  });

  it("restores a valid persisted session without another login", () => {
    const storage = new MemoryStorage();
    const persisted: AuthSession = {
      userId: "demo-user",
      displayName: "Demo User",
      email: "restored@example.com",
      loggedInAt: "2026-09-08T08:00:00.000Z",
    };
    storage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify(persisted));

    const controller = createMockAuthController(storage);
    controller.initialize();

    expect(controller.gate.getSnapshot()).toEqual({ status: "ready" });
    expect(controller.session.getSnapshot()).toEqual({
      authenticated: true,
      session: persisted,
    });
  });

  it.each(["{broken", "{}", JSON.stringify({ email: 42 })])(
    "clears damaged session data and remains blocked: %s",
    (raw) => {
      const storage = new MemoryStorage();
      storage.setItem(MOCK_AUTH_STORAGE_KEY, raw);

      const controller = createMockAuthController(storage);
      controller.initialize();

      expect(storage.getItem(MOCK_AUTH_STORAGE_KEY)).toBeNull();
      expect(controller.gate.getSnapshot()).toEqual({ status: "blocked" });
      expect(controller.session.getSnapshot()).toEqual({
        authenticated: false,
      });
    },
  );
});

describe("mock auth Application Gate", () => {
  it("shows login, activates Workspace after submit, and deactivates it on logout", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
    const workspaceCleanup = vi.fn();
    const registry = createPluginRegistry([
      mockAuthLoginPlugin,
      definition("workspace", {
        inject: [AUTH_SESSION_SERVICE],
        setup: () => workspaceCleanup,
        Component: WorkspaceWithLogout,
      }),
      definition("telemetry", { headless: true }),
    ]);
    let renderer: ReturnType<typeof create> | undefined;

    act(() => {
      renderer = create(
        <UIPluginRuntime
          actions={runtimeActions}
          model={createAuthModel()}
          registry={registry}
        />,
      );
    });

    expect(
      renderer?.root.findAllByProps({ "data-ui-plugin": "mock-auth-login" }),
    ).toHaveLength(1);
    expect(
      renderer?.root.findAllByProps({ "data-test-workspace": true }),
    ).toHaveLength(0);

    act(() => {
      renderer?.root.findByType("form").props.onSubmit({
        preventDefault: vi.fn(),
      });
    });

    expect(storage.getItem(MOCK_AUTH_STORAGE_KEY)).not.toBeNull();
    expect(
      renderer?.root.findAllByProps({ "data-ui-plugin": "mock-auth-login" }),
    ).toHaveLength(0);
    expect(
      renderer?.root.findAllByProps({ "data-test-workspace": true }),
    ).toHaveLength(1);

    act(() => {
      renderer?.root
        .findByProps({ "data-test-workspace": true })
        .props.onClick();
    });

    expect(storage.getItem(MOCK_AUTH_STORAGE_KEY)).toBeNull();
    expect(
      renderer?.root.findAllByProps({ "data-ui-plugin": "mock-auth-login" }),
    ).toHaveLength(1);
    expect(
      renderer?.root.findAllByProps({ "data-test-workspace": true }),
    ).toHaveLength(0);
    expect(workspaceCleanup).toHaveBeenCalledOnce();

    act(() => renderer?.unmount());
  });

  it(
    "keeps ordinary headless plugins inactive until ready and cleans them up after logout",
    () => {
      const storage = new MemoryStorage();
      vi.stubGlobal("localStorage", storage);
      const telemetryCleanup = vi.fn();
      const telemetrySetup = vi.fn(() => telemetryCleanup);
      const runtime = new PluginServiceRuntime();
      runtime.reconcile(
        createAuthModel(),
        createPluginRegistry([
          mockAuthLoginPlugin,
          definition("workspace"),
          definition("telemetry", { headless: true, setup: telemetrySetup }),
        ]),
        runtimeActions,
      );

      expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("blocked");
      expect(runtime.getActivation("mock-auth-login-main")?.status).toBe(
        "active",
      );
      expect(runtime.getActivation("workspace-main")).toBeUndefined();
      expect(runtime.getActivation("telemetry-main")).toBeUndefined();

      const auth = runtime.get<AuthSessionService>(AUTH_SESSION_SERVICE);
      auth?.login();

      expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("ready");
      expect(runtime.getActivation("workspace-main")?.status).toBe("active");
      expect(runtime.getActivation("telemetry-main")?.status).toBe("active");

      auth?.logout();

      expect(storage.getItem(MOCK_AUTH_STORAGE_KEY)).toBeNull();
      expect(runtime.applicationLifecycle.getSnapshot().phase).toBe("blocked");
      expect(runtime.getActivation("workspace-main")).toBeUndefined();
      expect(runtime.getActivation("telemetry-main")).toBeUndefined();
      expect(telemetryCleanup).toHaveBeenCalledOnce();
    },
  );

  it("keeps the default model free of the optional mock Gate", () => {
    const model = parseAppUIModel(appUIJson);
    const instance = model.pluginInstances["mock-auth-login-main"];

    expect(instance).toBeUndefined();
    expect(JSON.stringify(model.root)).not.toContain("mock-auth");
  });
});
