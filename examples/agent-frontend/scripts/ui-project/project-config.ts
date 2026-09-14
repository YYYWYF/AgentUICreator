import type { UIProjectControlConfig } from "./types";

export const uiProjectControlConfig = {
  catalogs: [],
  nonPluginDirectories: [],
  uiPackages: ["react", "react-dom", "@base-ui/react"],
  agentUI: {
    sourceRoot: "agent-ui",
    metadataRoot: ".agent-ui",
  },
} as const satisfies UIProjectControlConfig;
