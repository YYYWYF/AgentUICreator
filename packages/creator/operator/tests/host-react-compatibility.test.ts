import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { inspectAgentUIPackages } from "../src/project/source-registry/inspector";
import { ensureResourcePackages } from "../src/project/ensure-resource-packages";
import { loadAgentUISourceRegistry, type LoadedAgentUISourceItem } from "../src/source-catalog/index";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it.each(["18.3.1", "19.1.1", "19.3.1"])("accepts compatible host React %s without rewriting the project", async version => {
  const root = await mkdtemp(path.join(os.tmpdir(), "host react 中文 "));
  roots.push(root);
  const project = JSON.stringify({ dependencies: { react: version, "react-dom": version, antd: "6.6.7" } });
  await writeFile(path.join(root, "package.json"), project);
  await mkdir(path.join(root, "node_modules/react"), { recursive: true });
  await writeFile(path.join(root, "node_modules/react/package.json"), JSON.stringify({ name: "react", version }));
  const registry = await loadAgentUISourceRegistry();
  const items = registry.items.filter(item => item.packages?.react).map(item => ({ ...item, packages: { react: item.packages!.react! } }));
  expect(items.length).toBeGreaterThan(0);
  const result = await inspectAgentUIPackages(root, items);
  expect(result.issues).toEqual([]);
  expect(result.packages.every(item => item.compatible)).toBe(true);
  const install = vi.fn();
  await ensureResourcePackages(root, items, install);
  expect(install).not.toHaveBeenCalled();
  expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(project);
});

it.each(["17.0.2", "20.0.0"])("still blocks unsupported host React %s", async version => {
  const root = await mkdtemp(path.join(os.tmpdir(), "host-react-"));
  roots.push(root);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { react: version } }));
  await mkdir(path.join(root, "node_modules/react"), { recursive: true });
  await writeFile(path.join(root, "node_modules/react/package.json"), JSON.stringify({ name: "react", version }));
  const registry = await loadAgentUISourceRegistry();
  const original = registry.byId.get("foundation/core-runtime")!;
  const item: LoadedAgentUISourceItem = { ...original, packages: { react: original.packages!.react! } };
  expect((await inspectAgentUIPackages(root, [item])).issues).toContainEqual(expect.objectContaining({ code: "AGENT_UI_PACKAGE_INCOMPATIBLE", packageName: "react" }));
});
