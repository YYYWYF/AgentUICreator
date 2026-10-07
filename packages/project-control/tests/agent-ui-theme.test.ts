import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { UIProjectVerification } from "../src/verify-ui";
const verification = { status: "passed", errors: [], warnings: [] } as unknown as UIProjectVerification;
import { getAvailableAgentUIThemes, setAgentUITheme } from "../src/project/agent-ui-theme";
const roots: string[] = [];
async function project(source = 'import type { AgentUIThemeConfig } from "@agent-ui/react";\n// 中文 keep\nexport const agentUIThemeConfig = { theme: /* retain */ "light" } satisfies AgentUIThemeConfig;\n') {
  const root = await mkdtemp(path.join(tmpdir(), "theme-command-")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui")); await mkdir(path.join(root, "src/agent-ui/theme"), { recursive: true });
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "platform", sourceRoot: "src" }));
  await mkdir(path.join(root, "node_modules/@agent-ui/react"), { recursive: true });
  await writeFile(path.join(root, "node_modules/@agent-ui/react/package.json"), JSON.stringify({ type: "module", exports: { "./theme": { import: "./index.js" } } }));
  await writeFile(path.join(root, "node_modules/@agent-ui/react/index.js"), 'export const AGENT_UI_THEME_PRESETS = { light: {}, violet: {}, custom: {} };');
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022" }, include: ["src/**/*.ts"] }));
  await writeFile(path.join(root, "src/agent-ui/theme/theme-config.ts"), source); return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it("reads installed presets, including additions, and preserves surrounding source", async () => {
  const root = await project();
  expect((await getAvailableAgentUIThemes(root)).options.map(option => option.id)).toEqual(["light", "violet", "custom"]);
  const result = await setAgentUITheme(root, "custom", async change => { expect(change.after).toBe(change.before.replace('"light"', '"custom"')); return { runId: "transaction-1", verification }; });
  expect(result.changed).toBe(true); expect(result.runId).toBe("transaction-1");
});
it("unknown themes never reach storage and unverified storage results cannot claim success", async () => {
  const root = await project(); const commit = vi.fn();
  await expect(setAgentUITheme(root, "invalid", commit)).rejects.toThrow("UNKNOWN_THEME"); expect(commit).not.toHaveBeenCalled();
  await expect(setAgentUITheme(root, "violet", async () => ({ verification: { ...verification, status: "failed" } }))).rejects.toThrow("THEME_STATIC_VALIDATION_FAILED");
});
it("passes identical bytes to storage for idempotent admission and leaves failures untouched", async () => {
  const root = await project(); const file = path.join(root, "src/agent-ui/theme/theme-config.ts"); const before = await readFile(file, "utf8");
  expect((await setAgentUITheme(root, "light", async change => { expect(change.before).toBe(change.after); return { verification }; })).changed).toBe(false);
  await expect(setAgentUITheme(root, "violet", async () => { throw new Error("storage failed"); })).rejects.toThrow("storage failed");
  expect(await readFile(file, "utf8")).toBe(before);
});
it("rejects dynamic or spread configurations rather than rewriting arbitrary code", async () => {
  const root = await project('export const agentUIThemeConfig = { theme: "light", ...other };');
  await expect(getAvailableAgentUIThemes(root)).rejects.toThrow("THEME_CONFIGURATION_UNSUPPORTED");
});
