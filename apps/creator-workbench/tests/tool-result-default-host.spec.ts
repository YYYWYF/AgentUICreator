import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

for (const mode of ["platform", "assistant", "embedded"] as const) {
  test(`${mode} template displays multimodal tool results by default`, async ({ page }, testInfo) => {
    const preview = await createConnectionHostFixture({ mode });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      const sourceRoot = path.join(preview.hostRoot, "src/agent-ui");
      const model = await readFile(path.join(sourceRoot, "app-ui.json"), "utf8");
      expect(model).toContain('"pluginId": "tool-result"');
      expect(model).not.toContain('"pluginId": "tool-fallback"');
      expect(await readFile(path.join(sourceRoot, "plugins/tool-result/index.tsx"), "utf8"))
        .toMatch(/from ["']@za38\.03\/agent-ui-plugins\/tool-result["']/);
      const parts = [
        { type: "text", text: "The default template renders the report and its preview." },
        { type: "image", source: { type: "data", mimeType: "image/png", value: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=" }, metadata: { filename: "preview.png" } },
        { type: "document", source: { type: "data", mimeType: "application/pdf", value: "JVBERi0xLjQK" }, metadata: { filename: "report.pdf" } },
      ];
      await page.route(`${preview.hostOrigin}agent`, async route => {
        const input = route.request().postDataJSON();
        const identity = { threadId: input.threadId, runId: input.runId };
        const events = [
          { type: "RUN_STARTED", ...identity },
          { type: "TEXT_MESSAGE_START", messageId: "a1", role: "assistant" },
          { type: "TEXT_MESSAGE_END", messageId: "a1" },
          { type: "TOOL_CALL_START", toolCallId: "report", toolCallName: "generate_report", parentMessageId: "a1" },
          { type: "TOOL_CALL_ARGS", toolCallId: "report", delta: "{}" },
          { type: "TOOL_CALL_END", toolCallId: "report" },
          { type: "TOOL_CALL_RESULT", toolCallId: "report", messageId: "result1", role: "tool", content: parts },
          { type: "RUN_FINISHED", ...identity, outcome: { type: "success" } },
        ];
        await route.fulfill({ contentType: "text/event-stream", body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
      });
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.goto(preview.hostOrigin);
      if (mode === "assistant") await page.getByRole("button", { name: "打开助手", exact: true }).click();
      await page.locator(".aui-composer-root").getByRole("textbox").fill("Generate a report");
      await page.locator(".aui-composer-send").click();
      await page.getByRole("button", { name: "1 次工具调用", exact: true }).click();
      const content = page.locator('[data-slot="tool-result-content"]');
      await expect(content).toBeVisible();
      await expect(content).toContainText(parts[0]!.text!);
      expect(await content.locator("[data-content-type]").evaluateAll(elements => elements.map(element => element.getAttribute("data-content-type"))))
        .toEqual(["text", "image", "document"]);
      await expect(content.locator("img")).toBeVisible();
      await expect(content.locator("img")).toHaveJSProperty("naturalWidth", 1);
      await expect(content.locator('[download="report.pdf"]')).toBeVisible();
      await expect(page.locator('[data-plugin-state="error"]')).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`${mode}-tool-result.png`), animations: "disabled" });
      expect(errors).toEqual([]);
    } finally { await preview.close(); }
  });
}
