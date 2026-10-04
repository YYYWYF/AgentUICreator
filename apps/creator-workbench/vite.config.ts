import path from "node:path";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import {
  createMockAgentVitePlugin,
  showcaseMockScenarios,
  createMockConversationApiVitePlugin,
  withPreviewAgentState,
} from "../../packages/mock-agent/src/index";
import { defineConfig } from "vite";

import { createCreatorDevServerPlugin } from "../../packages/creator/src/vitePlugin.js";
import { CreatorWorkspaceManager } from "../../packages/creator/src/workspace/CreatorWorkspaceManager.js";
import { PythonCreatorProcessManager } from "../../packages/creator/src/PythonCreatorProcessManager.js";
import { createAgentUIInitializationHost, inspectCreatorProject } from "@agent-ui/project-control/dev";
import { initializeAgentUIProject } from "@agent-ui/bootstrap";
import { handleUIProjectControlRequest } from "@agent-ui/project-control/dev";
import type { MockProjectInspector } from "../../packages/creator/src/mock/demo-compatibility";
import { installOfficialAgentUIResource, inspectScenarioResources } from "@agent-ui/project-control/dev";
import { mergeOptionalResourceInspection } from "@agent-ui/project-control/dev";
import { installDemoPlugin } from "@agent-ui/project-control/dev";
import { suggestAgentUISourceRoot, validateAgentUIProjectSetup } from "@agent-ui/bootstrap";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const hostProjectRoot = path.join(workspaceRoot, "examples/creator-host-sandbox");
const initializationHost = createAgentUIInitializationHost();
const workspaceManager = new CreatorWorkspaceManager({
  inspectProject: inspectCreatorProject,
  initializeProject: input => initializeAgentUIProject(input, initializationHost),
  validateProjectSetup: validateAgentUIProjectSetup,
  suggestSourceRoot: suggestAgentUISourceRoot,
  createPythonManager: (projectRoot) => new PythonCreatorProcessManager({
    projectRoot,
    configRoot: workspaceRoot,
    allowExternalEndpoint: false,
  }),
});

export default defineConfig({
  envDir: workspaceRoot,
  define: {
    __CREATOR_HOST_WORKSPACE_ID__: JSON.stringify(
      createHash("sha256").update(realpathSync(hostProjectRoot)).digest("hex"),
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "creator-default-host-project",
      async configureServer() {
        await workspaceManager.selectProject(hostProjectRoot);
      },
    },
    createMockAgentVitePlugin({
      endpoint: "/__agent-ui/mock",
      scenarios: showcaseMockScenarios.map(withPreviewAgentState),
      defaultScenarioId: "reasoning-tool-success",
    }),
    createMockConversationApiVitePlugin({
      endpoint: "/__agent-ui/mock-data",
    }),
    createCreatorDevServerPlugin({
      workspaceManager,
      installMockPlugin: installDemoPlugin,
      installOfficialAgentUIResource,
      // Host adapter calls the same formal protocol as Python Creator tools.
      inspectMockProject: async target => {
        const composition = await handleUIProjectControlRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, target.projectRoot);
        const sources = await handleUIProjectControlRequest({ operation: "inspect_agent_ui_sources", input: {} }, target.projectRoot);
        if (!composition.ok || !sources.ok) throw new Error("Project inspection failed");
        const result = { composition: composition.result, sources: sources.result } as Awaited<ReturnType<MockProjectInspector>>;
        const resources = await inspectScenarioResources(target.projectRoot);
        return { ...result, sources: await mergeOptionalResourceInspection(result.sources, resources) };
      },
      configRoot: workspaceRoot,
    }),
  ],
  resolve: {
    alias: {
      "@agent-ui/react/styles.css": path.join(
        workspaceRoot,
        "packages/react/src/styles.css",
      ),
      "@agent-ui/creator/host-preview": path.join(workspaceRoot, "packages/creator/src/host-preview/hostPreviewWorkbench.ts"),
      "@agent-ui/creator/ui": path.join(
        workspaceRoot,
        "packages/creator/src/ui/CreatorWorkbench.tsx",
      ),
      "@agent-ui/creator/runtime-diagnostics": path.join(
        workspaceRoot,
        "packages/creator/src/runtime-diagnostics/runtimeDiagnosticReporter.ts",
      ),
      "@agent-ui/creator/visual-observation": path.join(
        workspaceRoot,
        "packages/creator/src/visual-observation/VisualObservationReporter.ts",
      ),
      "@agent-ui/react": path.join(
        workspaceRoot,
        "packages/react/src/index.ts",
      ),
      "@agent-ui/runtime-conversation": path.join(
        workspaceRoot,
        "packages/runtime-conversation/src/index.ts",
      ),
      "@agent-ui/runtime-core/testing": path.join(
        workspaceRoot,
        "packages/runtime-core/src/testing/index.ts",
      ),
      "@agent-ui/runtime-core": path.join(
        workspaceRoot,
        "packages/runtime-core/src/index.ts",
      ),
      "@agent-ui/runtime-react": path.join(
        workspaceRoot,
        "packages/runtime-react/src/index.ts",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [workspaceRoot] },
  },
});
