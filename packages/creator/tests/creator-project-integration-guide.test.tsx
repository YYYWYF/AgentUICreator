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

  it("keeps integration instructions collapsed by default", () => {
    const html = renderToStaticMarkup(
      <CreatorProjectIntegrationGuide sourceRoot="src/agent-ui" mode="platform" />,
    );
    expect(html).toContain("Agent UI 已创建");
    expect(html).toContain("查看接入方法");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("creator-project-integration-guide-body");
  });
});
