import { expect, test } from "@playwright/test";

test("refresh reattaches the mock run without a second Agent invocation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:5180/?run-resume-demo");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByTestId("conversation-messages")).toContainText("正在分析第一部分……");
  await expect(page.getByTestId("run-count")).toContainText("1");

  await page.reload();
  await expect(page.getByTestId("conversation-messages")).toContainText("正在分析第一部分……");
  await expect(page.getByTestId("conversation-messages")).toContainText("第二部分完成……任务完成", { timeout: 20_000 });
  const rendered = await page.getByTestId("conversation-messages").innerText();
  expect(rendered.split("正在分析第一部分……")).toHaveLength(2);
  await expect(page.locator('[data-role="user"]')).toHaveCount(1);
  await expect(page.getByTestId("run-count")).toContainText("1");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});
