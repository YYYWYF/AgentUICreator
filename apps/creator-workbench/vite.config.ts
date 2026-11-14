import path from "node:path";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { developmentCachePlugin, developmentReloadPlugin } from "./dev";

import { readCreatorHostConfigValue } from "../../packages/creator/src/creatorRuntimeConfig.js";
import { createCreatorDevServerPlugin } from "../../packages/creator/src/vitePlugin.js";
import { CreatorWorkspaceManager } from "../../packages/creator/src/workspace/CreatorWorkspaceManager.js";
import { CreatorProcessManager } from "../../packages/creator/src/CreatorProcessManager.js";
import { createAgentUIInitializationHost, inspectCreatorProject } from "@za38.03/agent-ui-creator/project/dev";
import { initializeAgentUIProject } from "@za38.03/agent-ui-creator/bootstrap";
import { handleUIOperatorRequest } from "@za38.03/agent-ui-creator/project/dev";
import type { MockProjectInspector } from "../../packages/creator/src/mock/demo-compatibility";
import { installOfficialAgentUIResource, inspectScenarioResources } from "@za38.03/agent-ui-creator/project/dev";
import { mergeOptionalResourceInspection } from "@za38.03/agent-ui-creator/project/dev";
import { suggestAgentUISourceRoot, validateAgentUIProjectSetup } from "@za38.03/agent-ui-creator/bootstrap";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const hostProjectRoot = path.join(workspaceRoot, "examples/creator-host-sandbox");
const initializationHost = createAgentUIInitializationHost();
const workspaceManager = new CreatorWorkspaceManager({
    compatibility: true,
  inspectProject: inspectCreatorProject,
  initializeProject: input => initializeAgentUIProject(input, initializationHost),
  validateProjectSetup: validateAgentUIProjectSetup,
  suggestSourceRoot: suggestAgentUISourceRoot,
  createRuntimeManager: (projectRoot) => new CreatorProcessManager({
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
    developmentCachePlugin(workspaceRoot, "workbench"),
    developmentReloadPlugin(workspaceRoot, workspaceManager),
    react(),
    tailwindcss(),
    {
      name: "creator-default-host-project",
      apply: "serve",
      configResolved(config) {
        for (const name of ["VITE_CREATOR_HOST_PREVIEW_URL", "VITE_ENABLE_VISUAL_OBSERVATION"]) {
          const value = readCreatorHostConfigValue(workspaceRoot, name);
          if (!config.env[name] && value) config.env[name] = value;
        }
      },
      async configureServer() {
        const selectedRoot = process.env.AGENT_UI_DEV_PROJECT_ROOT ?? hostProjectRoot;
        if (selectedRoot) await workspaceManager.selectProject(selectedRoot);
      },
    },
    createCreatorDevServerPlugin({
      workspaceManager,
      installOfficialAgentUIResource: async (projectRoot, resourceId) => { await installOfficialAgentUIResource(projectRoot, resourceId); },
      // Host adapter calls the same formal protocol as Creator Agent tools.
      inspectMockProject: async target => {
        const composition = await handleUIOperatorRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, target.projectRoot);
        const sources = await handleUIOperatorRequest({ operation: "inspect_agent_ui_sources", input: {} }, target.projectRoot);
        if (!composition.ok || !sources.ok) {
          const failure = !composition.ok ? composition.error : !sources.ok ? sources.error : undefined;
          throw Object.assign(new Error("Project inspection failed"), { code: failure?.code });
        }
        const result = { composition: composition.result, sources: sources.result } as Awaited<ReturnType<MockProjectInspector>>;
        const resources = await inspectScenarioResources(target.projectRoot);
        return { ...result, sources: await mergeOptionalResourceInspection(result.sources, resources) };
      },
      configRoot: workspaceRoot,
    }),
  ],
  optimizeDeps: { include: ["react", "react-dom/client", "@za38.03/agent-ui-creator > html-to-image"] },
  resolve: {
    alias: {
      "@za38.03/agent-ui-plugins/composer-support": path.join(workspaceRoot, "packages/plugins/src/composer-support.ts"),
      "@za38.03/agent-ui-plugins/composer": path.join(workspaceRoot, "packages/plugins/dist/composer/index.js"),
      "@za38.03/agent-ui-plugins/generative-ui.css": path.join(workspaceRoot, "packages/plugins/src/internal/vendor-generated/assistant-ui/generative-ui/generative-ui.css"),
      "@za38.03/agent-ui-plugins/generative-ui": path.join(workspaceRoot, "packages/plugins/src/generative-ui.ts"),
      "@za38.03/agent-ui-plugins/theme": path.join(workspaceRoot, "packages/plugins/src/theme/theme-contract.ts"),
      "@za38.03/agent-ui-plugins/demo-attachments": path.join(workspaceRoot, "packages/plugins/src/demo-attachments.ts"),
      "@za38.03/agent-ui-plugins/styles.css": path.join(
        workspaceRoot,
        "packages/plugins/src/styles.css",
      ),
      "@za38.03/agent-ui-creator/host-preview": path.join(workspaceRoot, "packages/creator/src/host-preview/hostPreviewWorkbench.ts"),
      "@za38.03/agent-ui-creator/ui": path.join(
        workspaceRoot,
        "packages/creator/src/ui/CreatorWorkbench.tsx",
      ),
      "@za38.03/agent-ui-creator/runtime-diagnostics": path.join(
        workspaceRoot,
        "packages/creator/src/runtime-diagnostics/runtimeDiagnosticReporter.ts",
      ),
      "@za38.03/agent-ui-creator/visual-observation": path.join(
        workspaceRoot,
        "packages/creator/src/visual-observation/VisualObservationReporter.ts",
      ),
      "@za38.03/agent-ui-plugins/lexical": path.join(workspaceRoot, "packages/plugins/src/lexical.tsx"),
      "@za38.03/agent-ui-plugins": path.join(
        workspaceRoot,
        "packages/plugins/src/index.ts",
      ),
      "@za38.03/agent-ui-runtime": path.join(
        workspaceRoot,
        "packages/runtime/src/index.ts",
      ),
      "@za38.03/agent-ui-core/testing": path.join(
        workspaceRoot,
        "packages/core/src/testing/index.ts",
      ),
      "@za38.03/agent-ui-core": path.join(
        workspaceRoot,
        "packages/core/src/index.ts",
      ),
      "@za38.03/agent-ui-renderer": path.join(
        workspaceRoot,
        "packages/renderer/src/index.ts",
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
