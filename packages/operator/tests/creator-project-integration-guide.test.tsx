// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CreatorLocaleProvider, CREATOR_LOCALES } from "../src/ui/i18n/locale.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  agentImportPathFromSrc,
  agentIntegrationSnippet,
  agentProviderIntegrationSnippet,
  CreatorProjectIntegrationGuide,
} from "../src/ui/setup/CreatorProjectIntegrationGuide.js";

describe("Creator project integration guide", () => {
  it("computes the public import from a Host component under src", () => {
    expect(agentImportPathFromSrc("src/agent-ui")).toBe("./agent-ui");
    expect(agentImportPathFromSrc("src/features/agent-ui")).toBe("./features/agent-ui");
    expect(agentImportPathFromSrc("agent-ui")).toBe("../agent-ui");
    expect(agentIntegrationSnippet("src/agent-ui")).toContain('import { Agent } from "./agent-ui";');
  });

  it("shows the shared Provider placement without message-handling logic", () => {
    const snippet = agentProviderIntegrationSnippet("src/features/agent-ui");
    expect(snippet).toContain('from "./features/agent-ui"');
    expect(snippet).toMatch(/<AgentUIProvider>[\s\S]*<YourBusinessComponents \/>[\s\S]*<Agent \/>[\s\S]*<\/AgentUIProvider>/);
    expect(snippet).not.toContain("useState");
    expect(snippet).not.toContain("sendMessage");
    expect(snippet).not.toContain("assistant-ui");
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
  it.each(["zh-CN", "en-US"] as const)("shows the integration request above limitations with manual guidance collapsed in %s", async (locale) => {
    const messages = CREATOR_LOCALES[locale].integration;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const click = async (label: string) => {
      const button = [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
      expect(button).toBeDefined();
      await act(async () => button!.click());
    };
    try {
      await act(async () => root.render(<CreatorLocaleProvider locale={locale}>
        <CreatorProjectIntegrationGuide sourceRoot="src/agent-ui" mode="embedded" />
      </CreatorLocaleProvider>));
      await click(messages.viewIntegrationInstructions);
      expect(container.textContent).toContain('import { Agent }');
      const steps = container.querySelectorAll(".creator-integration-step");
      expect(steps).toHaveLength(2);
      expect(steps[0]?.querySelector("h3")?.textContent).toBe(messages.reactDisplayStep);
      expect(steps[1]?.querySelector("h3")?.textContent).toBe(messages.reactConnectStep);
      expect(steps[1]?.querySelector("details")?.open).toBe(false);
      await click(messages.bridgeIntegration);
      expect(container.textContent).not.toContain('import { Agent }');
      expect(container.textContent).toContain(messages.bridgeLimitations);
      const prompt = container.querySelector(".creator-integration-prompt")!;
      expect(prompt.textContent).toBe(messages.bridgePrompt);
      expect(prompt.closest("details")).toBeNull();
      expect(container.textContent).toContain(messages.bridgeCopyInstruction);
      await click(messages.bridgeCopyButton);
      expect(writeText).toHaveBeenCalledWith(messages.bridgePrompt);
      expect(container.textContent).toContain(messages.copied);
      const details = container.querySelector("details")!;
      expect(details.open).toBe(false);
      expect(details.querySelector("summary")?.textContent).toBe(messages.bridgeManualHeading);
      expect(details.textContent).toContain(messages.bridgeManualPrompt);
      expect(details.querySelector("button")).toBeNull();
      await click(messages.reactIntegration);
      expect(container.textContent).toContain('import { Agent }');
      expect(container.textContent).not.toContain(messages.bridgeLimitations);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("defaults a bound Vue host to its bridge and publishes through the explicit build action", async () => {
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    const build = vi.fn(async () => ({})); const messages = CREATOR_LOCALES["zh-CN"].integration;
    try {
      await act(async () => root.render(<CreatorProjectIntegrationGuide sourceRoot="src/agent-ui" mode="embedded" hostFramework="vue" onBuild={build} />));
      await act(async () => container.querySelector("button")!.click());
      expect(container.textContent).toContain(messages.boundProducerDescription);
      expect(container.textContent).not.toContain('import { Agent }');
      const button = [...container.querySelectorAll("button")].find(item => item.textContent === messages.buildProducer)!;
      expect(build).not.toHaveBeenCalled();
      await act(async () => button.click());
      expect(build).toHaveBeenCalledOnce();
      expect(container.textContent).toContain(messages.producerPublished);
    } finally { await act(async () => root.unmount()); container.remove(); }
  });

});
