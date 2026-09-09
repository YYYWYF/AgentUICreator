import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";

import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";
import { useAgentUIRoot } from "../agent-ui/foundation/context";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Agent UI foundation isolation", () => {
  it("keeps distributable CSS scoped and variables namespaced", async () => {
    const cssPaths = [
      "agent-ui/styles/tokens.css",
      "agent-ui/styles/reset.css",
      "agent-ui/primitives/button.module.css",
      "agent-ui/primitives/textarea.module.css",
      "agent-ui/primitives/dialog.module.css",
    ];
    for (const relativePath of cssPaths) {
      const source = await readFile(path.join(projectRoot, relativePath), "utf8");
      expect(source).not.toMatch(/(^|[}\s,]):root\b/mu);
      expect(source).not.toMatch(/(^|[}\s,])(html|body|button|input|textarea)\b/mu);
      for (const declaration of source.matchAll(/--([a-z0-9-]+)\s*:/gu)) {
        expect(declaration[1]).toMatch(/^aui-/u);
      }
    }
  });

  it("provides a root-owned portal host without mutating documentElement", async () => {
    let capturedPortal: HTMLElement | null = null;
    function Probe() {
      capturedPortal = useAgentUIRoot().portalContainer;
      return null;
    }
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <AgentUIRoot theme="dark">
          <Probe />
        </AgentUIRoot>,
        {
          createNodeMock: (element) =>
            element.props["data-agent-ui-portal-host"] === true
              ? ({ kind: "portal-host" } as unknown as HTMLElement)
              : null,
        },
      );
    });
    expect(capturedPortal).toEqual({ kind: "portal-host" });
    expect(renderer!.root.findByProps({ "data-agent-ui-root": true }).props).toMatchObject({
      "data-agent-ui-theme": "dark",
    });
    const appSource = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");
    const dialogSource = await readFile(
      path.join(projectRoot, "agent-ui/primitives/dialog.tsx"),
      "utf8",
    );
    expect(appSource).not.toContain("document.documentElement.style.colorScheme");
    expect(dialogSource).toContain("container={portalContainer}");
    expect(dialogSource).not.toContain("document.body");
  });
});
