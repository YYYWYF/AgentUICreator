import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  agentImportPathFromSrc,
  agentIntegrationSnippet,
  CreatorProjectIntegrationGuide,
} from "../src/ui/setup/CreatorProjectIntegrationGuide.js";

describe("Creator project integration guide", () => {
  it("computes the public import from a Host component under src", () => {
    expect(agentImportPathFromSrc("src/agent-ui")).toBe("./agent-ui");
    expect(agentImportPathFromSrc("src/features/agent-ui")).toBe("./features/agent-ui");
    expect(agentImportPathFromSrc("agent-ui")).toBe("../agent-ui");
    expect(agentIntegrationSnippet("src/agent-ui")).toContain('import { Agent } from "./agent-ui";');
  });

  it("shows the generated entry, a concrete mount example, and Mode placement", () => {
    const html = renderToStaticMarkup(
      <CreatorProjectIntegrationGuide sourceRoot="src/agent-ui" mode="platform" />,
    );
    expect(html).toContain("Agent UI 已创建");
    expect(html).toContain("src/agent-ui/index.ts");
    expect(html).toContain("src/AgentMount.tsx");
    expect(html).toContain("./agent-ui");
    expect(html).toContain("应用的主页面或工作台区域");
    expect(html).toContain("/agent");
  });
});
