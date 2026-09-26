import path from "node:path";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import {
  createMockAgentVitePlugin,
  showcaseMockScenarios,
} from "../../packages/mock-agent/src/index";
import { defineConfig } from "vite";

import { createCreatorDevServerPlugin } from "../../packages/creator/src/vitePlugin.js";
import { CreatorWorkspaceManager } from "../../packages/creator/src/workspace/CreatorWorkspaceManager.js";
import { PythonCreatorProcessManager } from "../../packages/creator/src/PythonCreatorProcessManager.js";
// TODO: move the host inspector adapter out of the example when the shared project contract is extracted.
import { inspectCreatorProject } from "../../examples/agent-frontend/scripts/ui-project/creator-project-inspector";
import { initializeAgentUIProject } from "../../examples/agent-frontend/scripts/ui-project/initialize-agent-ui-project";
import { handleUIProjectControlRequest } from "../../examples/agent-frontend/scripts/ui-project-control";
import type { MockProjectInspector } from "../../packages/creator/src/mock/demo-compatibility";
import { installScenarioResources, inspectScenarioResources } from "../../examples/agent-frontend/scripts/ui-project/install-scenario-resources";
import { installDemoPlugin } from "../../examples/agent-frontend/scripts/ui-project/install-demo-plugin";
import { suggestAgentUISourceRoot, validateAgentUIProjectSetup } from "../../packages/bootstrap/src/source-root";
import { createMockConversationApiVitePlugin } from "../../examples/agent-frontend/dev-mock/conversations/vite-plugin";
import { withPreviewAgentState } from "../../examples/agent-frontend/src/mock-scenario-preview";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const frontendRoot = path.join(workspaceRoot, "examples/agent-frontend");
const workspaceManager = new CreatorWorkspaceManager({
  inspectProject: inspectCreatorProject,
  initializeProject: initializeAgentUIProject,
  validateProjectSetup: validateAgentUIProjectSetup,
  suggestSourceRoot: suggestAgentUISourceRoot,
  createPythonManager: (projectRoot) => new PythonCreatorProcessManager({
    projectRoot,
    configRoot: workspaceRoot,
    allowExternalEndpoint: false,
  }),
});

export default defineConfig({
  envDir: frontendRoot,
  define: {
    __CREATOR_EXAMPLE_WORKSPACE_ID__: JSON.stringify(
      createHash("sha256").update(realpathSync(frontendRoot)).digest("hex"),
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
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
      installScenarioResources,
      // Host adapter calls the same formal protocol as Python Creator tools.
      inspectMockProject: async target => {
        const composition = await handleUIProjectControlRequest({ schemaVersion: 3, operation: "inspect_ui_project", input: { view: "composition" } }, target.projectRoot);
        const sources = await handleUIProjectControlRequest({ schemaVersion: 3, operation: "inspect_agent_ui_sources", input: {} }, target.projectRoot);
        if (!composition.ok || !sources.ok) throw new Error("Project inspection failed");
        const result = { composition: composition.result, sources: sources.result } as Awaited<ReturnType<MockProjectInspector>>;
        const resources = await inspectScenarioResources(target.projectRoot);
        return { ...result, sources: { ...result.sources, items: [
          ...result.sources.items.filter(item => !item.id.startsWith("demo/")),
          ...resources.items.filter(item => item.id.startsWith("demo/")),
        ] } };
      },
      configRoot: workspaceRoot,
    }),
  ],
  resolve: {
    alias: {
      "@": path.join(frontendRoot, "src"),
      "@agent-ui/react/styles.css": path.join(
        workspaceRoot,
        "packages/react/src/styles.css",
      ),
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
      "@agent-ui/example-agent-frontend/App": path.join(
        frontendRoot,
        "src/App.tsx",
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
