import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

test("shared Tooltip stays readable in a zero-width floating Host with base styles only", async ({ page }, testInfo) => {
  const preview = await createConnectionHostFixture({ prepareHost: async hostRoot => {
    await writeFile(path.join(hostRoot, "src/main.tsx"), `
import { createRoot } from "react-dom/client";
import { AgentUIRoot, AgentUITooltipProvider, AgentUITooltip, AgentUITooltipTrigger, AgentUITooltipContent } from "@za38.03/agent-ui-plugins";
import "@za38.03/agent-ui-plugins/styles-base.css";
import "./host.css";
createRoot(document.getElementById("root")!).render(
  <div style={{position:"fixed",left:100,top:100,width:0,height:0}}>
    <AgentUIRoot theme="light"><AgentUITooltipProvider>
      {["添加附件", "这是一段需要自动换行的较长提示，用来确认浮层不会超出可用区域。".repeat(3)].map((text, index) =>
        <AgentUITooltip key={index}>
          <AgentUITooltipTrigger style={{position:"absolute",top:index * 80,width:40,height:40}} aria-label={index ? "Long tooltip" : "Short tooltip"}>+</AgentUITooltipTrigger>
          <AgentUITooltipContent side="right"><span>{text}</span></AgentUITooltipContent>
        </AgentUITooltip>
      )}
    </AgentUITooltipProvider></AgentUIRoot>
  </div>
);`);
  } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 480, height: 640 });
    await page.goto(preview.hostOrigin);
    await page.getByRole("button", { name: "Short tooltip", exact: true }).hover();
    const tooltip = page.locator('[data-slot="tooltip-content"][data-open]');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText("添加附件");
    const short = await tooltip.evaluate(element => {
      const label = element.querySelector("span")!;
      const range = document.createRange(); range.selectNodeContents(label);
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, lines: range.getClientRects().length, scoped: !!element.closest("[data-agent-ui-portal-root]") };
    });
    expect(short.lines).toBe(1);
    expect(short.width).toBeGreaterThan(50);
    expect(short.height).toBeLessThan(50);
    expect(short.scoped).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("tooltip-short.png"), animations: "disabled" });
    await page.getByRole("button", { name: "Long tooltip", exact: true }).hover();
    await expect(tooltip).toContainText("这是一段需要自动换行");
    const long = await tooltip.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element.querySelector("span")!);
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { width: rect.width, left: rect.left, right: rect.right, lines: range.getClientRects().length, uncovered: hit !== null && element.contains(hit) };
    });
    expect(long.width).toBeLessThanOrEqual(320);
    expect(long.left).toBeGreaterThanOrEqual(0);
    expect(long.right).toBeLessThanOrEqual(480);
    expect(long.lines).toBeGreaterThan(1);
    expect(long.uncovered).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("tooltip-long.png"), animations: "disabled" });
    await writeFile(testInfo.outputPath("tooltip-measurements.json"), JSON.stringify({ short, long, errors }, null, 2));
    expect(errors).toEqual([]);
  } finally { await preview.close(); }
});
