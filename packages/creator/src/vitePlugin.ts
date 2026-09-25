import type { Plugin } from "vite";
import type { ServerResponse } from "node:http";

import {
  PythonCreatorProcessManager,
  type PythonCreatorProcessManagerOptions,
} from "./PythonCreatorProcessManager.js";
import { proxyPythonCreatorRequest } from "./PythonCreatorProxy.js";
import { CreatorWorkspaceManager, CreatorWorkspaceError } from "./workspace/CreatorWorkspaceManager.js";
import { CREATOR_WORKSPACE_API_PATH, handleCreatorWorkspaceRequest } from "./workspace/workspace-api.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "./workspace/types.js";
import {
  resolveCreatorPythonAgentMode,
  resolveCreatorVerificationMode,
  type LoadCreatorHostConfigOptions,
} from "./creatorRuntimeConfig.js";
import {
  CREATOR_API_PATH,
  CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
  CREATOR_VISUAL_OBSERVATION_API_PATH,
} from "./shared.js";

export {
  CREATOR_API_PATH,
  CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
  CREATOR_VISUAL_OBSERVATION_API_PATH,
} from "./shared.js";
export {
  resolveCreatorPythonAgentMode,
  type LoadCreatorHostConfigOptions,
} from "./creatorRuntimeConfig.js";
export {
  PythonCreatorProcessManager,
  PythonCreatorRuntimeError,
  resolveConfiguredCreatorPythonEndpoint,
  type PythonCreatorEndpoint,
  type PythonCreatorExternalEndpoint,
  type PythonCreatorProcessManagerOptions,
} from "./PythonCreatorProcessManager.js";

export interface CreatorDevServerPluginOptions {
  projectRoot?: string | undefined;
  workspaceManager?: CreatorWorkspaceManager | undefined;
  configRoot?: string | undefined;
  python?:
    | Omit<
        PythonCreatorProcessManagerOptions,
        "projectRoot" | "configRoot"
      >
    | undefined;
}

export function createCreatorDevServerPlugin({
  projectRoot,
  workspaceManager,
  configRoot,
  python,
}: CreatorDevServerPluginOptions): Plugin {
  const creatorLog =
    python?.log ?? ((message: string) => console.error(`[Creator] ${message}`));
  const environment = python?.environment ?? process.env;
  const agentMode = resolveCreatorPythonAgentMode({
    configRoot,
    environment,
  });
  const runtimeDiagnosticsEnabled =
    resolveCreatorVerificationMode({ configRoot, environment }) ===
    "static_and_runtime";
  creatorLog(`runtime=python agentMode=${agentMode}`);

  if (workspaceManager === undefined && projectRoot === undefined) {
    throw new Error("Creator Dev Server requires a workspace manager or a legacy projectRoot.");
  }
  const legacyPythonManager = projectRoot === undefined ? undefined : new PythonCreatorProcessManager({
    projectRoot, ...(configRoot === undefined ? {} : { configRoot }),
    ...(python ?? {}), environment, log: creatorLog,
  });

  function gateError(response: ServerResponse, error: unknown): void {
    response.statusCode = 409;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({
      code: error instanceof CreatorWorkspaceError ? error.code : "CREATOR_WORKSPACE_INVALID",
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return {
    name: "agent-ui-creator-dev-server",
    apply: "serve",
    config() {
      return {
        define: {
          __CREATOR_RUNTIME_DIAGNOSTICS_ENABLED__: JSON.stringify(
            runtimeDiagnosticsEnabled,
          ),
        },
      };
    },
    configureServer(server) {
      server.httpServer?.once("close", () => {
        void workspaceManager?.clear();
        void legacyPythonManager?.dispose();
      });
      server.watcher.once("close", () => {
        void workspaceManager?.clear();
        void legacyPythonManager?.dispose();
      });
      if (workspaceManager !== undefined) {
        server.middlewares.use(CREATOR_WORKSPACE_API_PATH, (request, response) => {
          void handleCreatorWorkspaceRequest(request, response, workspaceManager, configRoot);
        });
      }
      const proxy = async (
        request: Parameters<typeof proxyPythonCreatorRequest>[0],
        response: ServerResponse,
        route: Parameters<typeof proxyPythonCreatorRequest>[3],
      ) => {
        let manager: PythonCreatorProcessManager;
        try {
          manager = workspaceManager?.ensureCreatorRuntime() ?? legacyPythonManager!;
          if (workspaceManager !== undefined) {
            const state = workspaceManager.getState();
            const selectedId = state.status === "none" ? undefined : state.workspace.id;
            if (request.headers[CREATOR_WORKSPACE_ID_HEADER] !== selectedId) {
              throw new CreatorWorkspaceError("CREATOR_WORKSPACE_CHANGED", "The selected Project Root changed. Refresh the workspace and retry.");
            }
          }
        } catch (error) {
          gateError(response, error);
          return;
        }
        const untrack = workspaceManager?.trackRequest(() => response.destroy());
        if (untrack !== undefined) response.once("close", untrack);
        await proxyPythonCreatorRequest(request, response, manager, route);
        untrack?.();
      };
      server.middlewares.use(
        CREATOR_VISUAL_OBSERVATION_API_PATH,
        async (request, response) => {
          await proxy(request, response, "/visual-observation");
        },
      );
      server.middlewares.use(
        CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
        async (request, response) => {
          await proxy(request, response, "/runtime-diagnostics");
        },
      );
      server.middlewares.use(
        CREATOR_API_PATH,
        async (request, response) => {
          await proxy(request, response, "/creator");
        },
      );
    },
  };
}
