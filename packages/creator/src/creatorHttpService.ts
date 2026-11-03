import { createCreatorCommandHandler } from "./commands/command-api.js";
import { CREATOR_COMMANDS_API_PATH } from "./commands/types.js";
import { createConnectionHandler } from "./agent-connection/connection-api.js";
import { suggestAgentUISourceRoot } from "@za38.03/agent-ui-creator/bootstrap";
import { planReactAgentUIProject, initializeReactAgentUIProject, inspectCreatorProject } from "@za38.03/agent-ui-creator/project/host";
import { createCreatorUpdateHandler, CREATOR_UPDATES_API_PATH } from "./updates/update-api.js";
import type { UpdateSourceProvider } from "@za38.03/agent-ui-creator/project/updates";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  CreatorProcessManager,
  type CreatorProcessManagerOptions,
} from "./CreatorProcessManager.js";
import { proxyCreatorRequest } from "./CreatorProxy.js";
import { CreatorWorkspaceManager, CreatorWorkspaceError } from "./workspace/CreatorWorkspaceManager.js";
import { CREATOR_WORKSPACE_API_PATH, handleCreatorWorkspaceRequest } from "./workspace/workspace-api.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "./workspace/types.js";
import { CreatorMockService } from "./mock/CreatorMockService.js";
import { CREATOR_MOCK_API_PATH } from "./mock/types.js";
import type { MockProjectInspector } from "./mock/demo-compatibility.js";
import { handleCreatorMockRequest } from "./mock/mock-api.js";
import {
  resolveCreatorAgentMode,
  resolveCreatorVerificationMode,
} from "./creatorRuntimeConfig.js";
import {
  CREATOR_API_PATH,
  CREATOR_CONTROL_API_PATH,
  CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
  CREATOR_VISUAL_OBSERVATION_API_PATH,
} from "./shared.js";

export type CreatorMiddleware = (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void | Promise<void>;
export interface CreatorMiddlewareRegistry {
  use(handler: CreatorMiddleware): unknown;
  use(route: string, handler: CreatorMiddleware): unknown;
}

export interface CreatorHttpServiceOptions {
  updateSourceProvider?: UpdateSourceProvider | undefined;
  inspectMockProject?: MockProjectInspector | undefined;
  installOfficialAgentUIResource?: ((projectRoot: string, resourceId: string) => Promise<void>) | undefined;
  projectRoot?: string | undefined;
  workspaceManager?: CreatorWorkspaceManager | undefined;
  configRoot?: string | undefined;
  runtime?:
    | Omit<
        CreatorProcessManagerOptions,
        "projectRoot" | "configRoot"
      >
    | undefined;
}

export function createCreatorHttpService({
  projectRoot,
  workspaceManager,
  configRoot,
  runtime,
  installOfficialAgentUIResource,
  inspectMockProject,
  updateSourceProvider,
}: CreatorHttpServiceOptions) {
  // Folder selection starts where Creator was launched, independently of secrets/config.
  const pickerStartDirectory = process.cwd();
  const installResource = installOfficialAgentUIResource;
  const creatorLog =
    runtime?.log ?? ((message: string) => console.error(`[Creator] ${message}`));
  const environment = runtime?.environment ?? process.env;
  const agentMode = resolveCreatorAgentMode({
    configRoot,
    environment,
  });
  const runtimeDiagnosticsEnabled =
    resolveCreatorVerificationMode({ configRoot, environment }) ===
    "static_and_runtime";
  creatorLog(`runtime=typescript agentMode=${agentMode}`);

  if (workspaceManager === undefined && projectRoot === undefined) {
    throw new Error("Creator Dev Server requires a workspace manager or a projectRoot.");
  }
  // Both integration forms need the same workspace API and project identity.
  // Defer selecting the initial root until an API request needs it, so mounting
  // the development plugin alone does not start an Agent process.
  const initialProjectRoot = workspaceManager === undefined ? projectRoot : undefined;
  if (workspaceManager === undefined) {
    workspaceManager = new CreatorWorkspaceManager({
      inspectProject: inspectCreatorProject,
      initializeProject: initializeReactAgentUIProject,
      validateProjectSetup: planReactAgentUIProject,
      suggestSourceRoot: suggestAgentUISourceRoot,
      createRuntimeManager: root => new CreatorProcessManager({
        projectRoot: root, configRoot, ...(runtime ?? {}), environment, log: creatorLog,
      }),
    });
  }
  const manager = workspaceManager;
  let initialSelection: Promise<unknown> | undefined;
  const mockService = new CreatorMockService();

  function gateError(response: ServerResponse, error: unknown): void {
    response.statusCode = 409;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({
      code: error instanceof CreatorWorkspaceError ? error.code : "CREATOR_WORKSPACE_INVALID",
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  let disposed: Promise<void> | undefined;
  const dispose = () => disposed ??= (async () => {
    await Promise.all([mockService.dispose(), manager.clear()]);
  })();
  return {
    runtimeDiagnosticsEnabled,
    dispose,
    mount(middlewares: CreatorMiddlewareRegistry) {
      middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split("?", 1)[0] ?? "";
        if (initialProjectRoot !== undefined &&
            (pathname.startsWith("/__creator/") || pathname.startsWith("/__agent-ui/"))) {
          try {
            if (disposed) throw new CreatorWorkspaceError("CREATOR_RUNTIME_DISPOSED", "Creator runtime was disposed.");
            await (initialSelection ??= manager.selectProject(initialProjectRoot).catch(error => {
              initialSelection = undefined;
              throw error;
            }));
          } catch (error) { gateError(response, error); return; }
        }
        next();
      });
      const connectionWorkspace = () => {
        const state = manager.getState();
        return state.status === "ready" ? state.workspace : undefined;
      };
      mockService.setProjectResolver(connectionWorkspace);
      const connectionHandler = createConnectionHandler(connectionWorkspace, (request, response) => mockService.handlePreviewRequest(request, response), workspace => mockService.getDurableStore(workspace.projectRoot));
      middlewares.use((request, response, next) => { return connectionHandler(request, response, next); });

      middlewares.use(CREATOR_COMMANDS_API_PATH, createCreatorCommandHandler(manager, undefined, undefined));
      middlewares.use(CREATOR_UPDATES_API_PATH, createCreatorUpdateHandler(manager, undefined, updateSourceProvider, { configRoot, environment }));
      middlewares.use(CREATOR_MOCK_API_PATH, (request, response) => {
        return handleCreatorMockRequest(request, response, mockService, () => {
          const state = manager.getState();
          if (state.status !== "ready") return undefined;
          return { id: state.workspace.id, projectRoot: state.workspace.projectRoot,
            ...(state.project.sourceRoot === undefined ? {} : { sourceRoot: state.project.sourceRoot }) };
        }, inspectMockProject, installResource === undefined ? undefined : async (id, resourceId) => {
          await manager.runProjectOperation(id, root => installResource(root, resourceId), { mutation: true });
        }, () => installResource !== undefined);
      });
      middlewares.use(CREATOR_WORKSPACE_API_PATH, (request, response) => {
        return handleCreatorWorkspaceRequest(request, response, manager, pickerStartDirectory);
      });
      const proxy = async (
        request: Parameters<typeof proxyCreatorRequest>[0],
        response: ServerResponse,
        route: Parameters<typeof proxyCreatorRequest>[3],
      ) => {
        let runtimeManager: CreatorProcessManager;
        try {
          runtimeManager = manager.ensureCreatorRuntime();
          const state = manager.getState();
          const selectedId = state.status === "none" ? undefined : state.workspace.id;
          if (request.headers[CREATOR_WORKSPACE_ID_HEADER] !== selectedId) {
            throw new CreatorWorkspaceError("CREATOR_WORKSPACE_CHANGED", "The selected Project Root changed. Refresh the workspace and retry.");
          }
        } catch (error) {
          gateError(response, error);
          return;
        }
        let untrack: (() => void) | undefined;
        try { untrack = manager.trackRequest(() => response.destroy()); }
        catch (error) { gateError(response, error); return; }
        if (untrack !== undefined) response.once("close", untrack);
        await proxyCreatorRequest(request, response, runtimeManager, route);
        untrack?.();
      };
      middlewares.use(
        CREATOR_VISUAL_OBSERVATION_API_PATH,
        async (request, response) => {
          await proxy(request, response, "/visual-observation");
        },
      );
      middlewares.use(
        CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
        async (request, response) => {
          await proxy(request, response, "/runtime-diagnostics");
        },
      );
      middlewares.use(
        CREATOR_CONTROL_API_PATH,
        async (request, response) => {
          await proxy(request, response, "/creator-control");
        },
      );
      middlewares.use(
        CREATOR_API_PATH,
        async (request, response) => {
          await proxy(request, response, "/creator");
        },
      );
    },
  };
}
