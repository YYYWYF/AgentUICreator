import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { prepareWorkbench } from "./prepare-workbench.mjs";
import { writeI18nVisualReport } from "./report-i18n-plugin-visual.mjs";

prepareWorkbench();
// Prevent a failed startup from publishing an earlier run's results.
await rm(new URL("../apps/creator-workbench/test-results/i18n-plugin-visual", import.meta.url), { recursive: true, force: true });
const result = spawnSync("pnpm", ["--filter", "@agent-ui/creator-workbench", "exec", "playwright", "test", "-c", "playwright.i18n-plugin-visual.config.ts", ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit",
});
// Preserve the browser process failure even when report generation also fails.
process.exitCode = result.status ?? 1;
if (result.error) console.error(result.error);
try {
  const summary = await writeI18nVisualReport();
  if (summary.verdict === "BLOCKED") process.exitCode = result.status || 1;
} catch (error) {
  console.error("I18n Plugin evidence generation failed:", error);
  process.exitCode = result.status || 1;
}
