import type { Plugin } from "vite";

import {
  PythonCreatorProcessManager,
  type PythonCreatorProcessManagerOptions,
} from "./PythonCreatorProcessManager.js";
import { proxyPythonCreatorRequest } from "./PythonCreatorProxy.js";
import {
  resolveCreatorPythonAgentMode,
  type LoadCreatorHostConfigOptions,
} from "./creatorRuntimeConfig.js";
import {
  CREATOR_API_PATH,
  CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
} from "./shared.js";

export {
  CREATOR_API_PATH,
  CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
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
  projectRoot: string;
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
  creatorLog(`runtime=python agentMode=${agentMode}`);

  const pythonManager = new PythonCreatorProcessManager({
    projectRoot,
    ...(configRoot === undefined ? {} : { configRoot }),
    ...(python ?? {}),
    environment,
    log: creatorLog,
  });

  return {
    name: "agent-ui-creator-dev-server",
    apply: "serve",
    configureServer(server) {
      server.httpServer?.once("close", () => {
        void pythonManager.dispose();
      });
      server.watcher.once("close", () => {
        void pythonManager.dispose();
      });
      server.middlewares.use(
        CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
        async (request, response) => {
          await proxyPythonCreatorRequest(
            request,
            response,
            pythonManager,
            "/runtime-diagnostics",
          );
        },
      );
      server.middlewares.use(
        CREATOR_API_PATH,
        async (request, response) => {
          await proxyPythonCreatorRequest(
            request,
            response,
            pythonManager,
            "/creator",
          );
        },
      );
    },
  };
}
