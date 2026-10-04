import { expect, test } from "@playwright/test";

test("formal generated binding reopens its initial thread and resumes after refresh", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5180/?run-resume-production");
  const threadId = await page.getByTestId("production-thread-id").innerText();
  expect(threadId).toBeTruthy();
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByTestId("production-conversation-messages")).toContainText("正在分析第一部分……");
  await expect(page.getByTestId("production-run-count")).toContainText("1");

  await page.reload();
  await expect(page.getByTestId("production-thread-id")).toHaveText(threadId);
  await expect(page.getByTestId("production-conversation-messages")).toContainText("正在分析第一部分……");
  await expect(page.getByTestId("production-conversation-messages")).toContainText("第二部分完成……任务完成", { timeout: 20_000 });
  const rendered = await page.getByTestId("production-conversation-messages").innerText();
  expect(rendered.split("正在分析第一部分……")).toHaveLength(2);
  await expect(page.locator('[data-role="user"]')).toHaveCount(1);
  await expect(page.getByTestId("production-run-count")).toContainText("1");
  expect(errors).toEqual([]);
});
