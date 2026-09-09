import type { UIProjectControlConfig } from "./types";

export const uiProjectControlConfig = {
  catalogs: ["plugins/antd-x-template-library"],
  nonPluginDirectories: ["plugins/_shared"],
  uiPackages: ["react", "react-dom", "antd", "@ant-design/x", "@base-ui/react"],
  agentUI: {
    sourceRoot: "agent-ui",
    metadataRoot: ".agent-ui",
  },
} as const satisfies UIProjectControlConfig;
