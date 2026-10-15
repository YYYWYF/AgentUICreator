import type { UIOperatorConfig } from "./types";

export const uiOperatorConfig = {
  catalogs: [],
  nonPluginDirectories: [],
  uiPackages: ["react", "react-dom", "@base-ui/react"],
  agentUI: {
    sourceRoot: "agent-ui",
    metadataRoot: ".agent-ui",
  },
} as const satisfies UIOperatorConfig;
