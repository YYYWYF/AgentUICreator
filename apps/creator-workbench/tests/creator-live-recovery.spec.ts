import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
import { captureWindowErrors } from "./support/window-errors.js";

async function hashes(root: string, directory = path.join(root, "src")): Promise<Record<string, string>> {
  const rows: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(rows, await hashes(root, file));
    else if (entry.isFile()) rows[path.relative(root, file).split(path.sep).join("/")] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
  return rows;
}

test("configured Creator edits a disposable Shell and its real receipt supports undo, reapply and conflict refusal", async ({ page }, testInfo) => {
  const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message));
  const fixture = await createConnectionHostFixture({ liveModel: true });
  const target = "src/agent-ui/application/shell/PlatformShell.tsx";
  const file = path.join(fixture.hostRoot, ...target.split("/"));
  const before = await readFile(file, "utf8"); const initial = await hashes(fixture.hostRoot);
  try {
    await page.goto(fixture.creatorOrigin);
    const preview = page.frameLocator('iframe[title="Host Application"]');
    await expect(preview.locator(".aui-composer-root")).toBeVisible({ timeout: 25_000 });
    const response = page.waitForResponse(value => new URL(value.url()).pathname === "/__creator/run" && value.request().method() === "POST", { timeout: 30_000 });
    await page.locator("#creator-request").fill(`请直接实施以下一个已确定的修改，只改 ${target}：在现有最外层 main 元素上添加 data-testid="creator-live-shell"，其他源码、样式、布局、插件和服务完全保留。不要接管源码、初始化工程或修改 Runtime/framework。这是项目自有 Shell 的普通编辑。我确认这个具体修改。请实际读取文件后编辑，运行工程已有的 typecheck 和 build，并验证预览可正常渲染后完成。`);
    await page.locator("#creator-request").press("Enter");
    const run = await response; expect(run.ok(), `Creator HTTP ${run.status()}`).toBe(true);
    const wire = await run.text();
    const events = wire.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
    const finish = [...events].reverse().find(event => event.type === "RUN_FINISHED");
    const summary = { tools: events.filter(event => event.type === "TOOL_CALL_START").map(event => event.toolCallName), finish: finish?.result, errors: events.filter(event => event.type === "RUN_ERROR"), questions: events.filter(event => event.type === "CUSTOM" && event.name === "on_interrupt").map(event => event.value) };
    await writeFile(fileURLToPath(new URL("../../../artifacts/remaining-acceptance-20261031/live-creator-summary.json", import.meta.url)), JSON.stringify(summary, null, 2));
    await testInfo.attach("live-creator-summary", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    expect(finish?.result?.completion, JSON.stringify(summary)).toBe("success");
    expect(finish.result.executionPolicy).toBe("domain-write");
    expect(finish.result.toolProtocol.modelCalls).toBeGreaterThan(0);
    expect(finish.result.receipt.validations).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: expect.stringContaining("typecheck"), status: "passed" }),
      expect.objectContaining({ command: expect.stringContaining("build"), status: "passed" }),
    ]));
    const changed = await readFile(file, "utf8"); expect(changed).toContain("creator-live-shell");
    const after = await hashes(fixture.hostRoot);
    expect(Object.keys(after).filter(name => after[name] !== initial[name])).toEqual([target]);
    await expect(preview.getByTestId("creator-live-shell")).toBeVisible();
    const undo = page.getByRole("button", { name: "撤销本次修改", exact: true }).last();
    await undo.click(); await expect.poll(() => readFile(file, "utf8")).toBe(before);
    await expect(preview.getByTestId("creator-live-shell")).toHaveCount(0);
    await page.getByRole("button", { name: "再次应用本次修改", exact: true }).last().click();
    await expect.poll(() => readFile(file, "utf8")).toBe(changed); await expect(preview.getByTestId("creator-live-shell")).toBeVisible();
    // A real outside edit must invalidate Undo rather than overwrite that edit.
    const external = changed + "\n// fixture external edit after Creator\n"; await writeFile(file, external);
    const refusal = page.waitForResponse(value => new URL(value.url()).pathname === "/__creator/control" && value.request().method() === "POST");
    await page.getByRole("button", { name: "撤销本次修改", exact: true }).last().click();
    const refused = await refusal; expect(refused.ok()).toBe(false);
    expect(await refused.json()).toMatchObject({ error: expect.stringContaining("CREATOR_UNDO_CONFLICT") });
    expect(await readFile(file, "utf8")).toBe(external);
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
