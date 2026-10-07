import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/verify-ui", () => ({ verifyUIProject: vi.fn(async () => ({ status: "passed" })) }));
import { verifyUIProject } from "../src/verify-ui";
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
afterEach(async () => { vi.mocked(verifyUIProject).mockResolvedValue({ status: "passed" } as Awaited<ReturnType<typeof verifyUIProject>>); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it("reads installed presets, including additions, and preserves surrounding source", async () => {
  const root = await project();
  expect((await getAvailableAgentUIThemes(root)).options.map(option => option.id)).toEqual(["light", "violet", "custom"]);
  const result = await setAgentUITheme(root, "custom", async change => { expect(change.after).toBe(change.before.replace('"light"', '"custom"')); return { runId: "transaction-1" }; });
  expect(result.changed).toBe(true); expect(result.runId).toBe("transaction-1");
});
it("unknown themes and failed validation never reach storage", async () => {
  const root = await project(); const commit = vi.fn();
  await expect(setAgentUITheme(root, "invalid", commit)).rejects.toThrow("UNKNOWN_THEME"); expect(commit).not.toHaveBeenCalled();
  vi.mocked(verifyUIProject).mockResolvedValue({ status: "failed" } as Awaited<ReturnType<typeof verifyUIProject>>);
  await expect(setAgentUITheme(root, "violet", commit)).rejects.toThrow("THEME_STATIC_VALIDATION_FAILED"); expect(commit).not.toHaveBeenCalled();
});
it("passes identical bytes to storage for idempotent admission and leaves failures untouched", async () => {
  const root = await project(); const file = path.join(root, "src/agent-ui/theme/theme-config.ts"); const before = await readFile(file, "utf8");
  expect((await setAgentUITheme(root, "light", async change => { expect(change.before).toBe(change.after); return {}; })).changed).toBe(false);
  await expect(setAgentUITheme(root, "violet", async () => { throw new Error("storage failed"); })).rejects.toThrow("storage failed");
  expect(await readFile(file, "utf8")).toBe(before);
});
it("rejects dynamic or spread configurations rather than rewriting arbitrary code", async () => {
  const root = await project('export const agentUIThemeConfig = { theme: "light", ...other };');
  await expect(getAvailableAgentUIThemes(root)).rejects.toThrow("THEME_CONFIGURATION_UNSUPPORTED");
});
