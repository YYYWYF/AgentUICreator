import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadEnv } from "vite";
import { DEVELOPMENT_ENV_PATH, installDevelopmentDefaults } from "../src/project/development-defaults";

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-ui-dev-env-"));
  roots.push(root);
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("creates a development-only Mock endpoint and preserves it on repeated installation", async () => {
  const root = await fixture();
  expect(await installDevelopmentDefaults(root)).toEqual([DEVELOPMENT_ENV_PATH]);
  expect(loadEnv("development", root).VITE_AGENT_ENDPOINT).toBe("http://127.0.0.1:47831/agent");
  expect(loadEnv("production", root).VITE_AGENT_ENDPOINT).toBeUndefined();
  await writeFile(path.join(root, DEVELOPMENT_ENV_PATH), "VITE_AGENT_ENDPOINT=https://example.com/agent\n");
  expect(await installDevelopmentDefaults(root)).toEqual([]);
  expect(loadEnv("development", root).VITE_AGENT_ENDPOINT).toBe("https://example.com/agent");
});

it.each([".env", ".env.local", ".env.development", DEVELOPMENT_ENV_PATH])("preserves an endpoint configured in %s", async name => {
  const root = await fixture();
  const content = "export VITE_AGENT_ENDPOINT=https://example.com/agent\n";
  await writeFile(path.join(root, name), content);
  expect(await installDevelopmentDefaults(root)).toEqual([]);
  expect(await readFile(path.join(root, name), "utf8")).toBe(content);
  expect(loadEnv("development", root).VITE_AGENT_ENDPOINT).toBe("https://example.com/agent");
});
