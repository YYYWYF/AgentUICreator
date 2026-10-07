import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { minVersion } from "semver";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "@agent-ui/source-registry";
import { detectResourcePackageManager, ensureResourcePackages, type ResourcePackageCommand } from "../../src/project/ensure-resource-packages";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(present: "all" | "some" | "none" = "none") {
  const root = await mkdtemp(path.join(tmpdir(), "official-resource-packages-")); roots.push(root);
  const closure = resolveAgentUISourceItemClosure(await loadAgentUISourceRegistry(), "integration/a2ui");
  const requirements = Object.assign({}, ...closure.map(item => item.packages ?? {})) as Record<string, string>;
  const dependencies: Record<string, string> = {};
  for (const [name, range] of Object.entries(requirements)) {
    if (present === "all" || (present === "some" && name !== "react-markdown")) {
      dependencies[name] = range;
      await installed(root, name, minVersion(range)!.version);
    }
  }
  await writeFile(path.join(root, "package.json"), JSON.stringify({ packageManager: "pnpm@10.15.0", dependencies }));
  const run = vi.fn(async (_root: string, command: ResourcePackageCommand) => {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    for (const specifier of command.args.slice(1)) {
      const split = specifier.lastIndexOf("@");
      const name = specifier.slice(0, split), range = specifier.slice(split + 1);
      manifest.dependencies[name] = range;
      await installed(root, name, minVersion(range)!.version);
    }
    await writeFile(path.join(root, "package.json"), JSON.stringify(manifest));
  });
  return { root, closure, requirements, run };
}
async function installed(root: string, name: string, version: string) {
  const directory = path.join(root, "node_modules", name); await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version }));
}
describe("Official Resource package installation", () => {
  it("automatically installs and deduplicates the entire missing A2UI closure", async () => {
    const f = await fixture();
    await ensureResourcePackages(f.root, f.closure, f.run);
    expect(f.run).toHaveBeenCalledTimes(1);
    const command = f.run.mock.calls[0]![1];
    expect(command.command).toBe("pnpm");
    expect(command.args[0]).toBe("add");
    expect(command.args.slice(1)).toHaveLength(Object.keys(f.requirements).length);
    expect(command.args).toContain("@assistant-ui/react-generative-ui@0.0.22");
    expect(command.args).toContain("react-markdown@10.1.0");
    expect(command.args).toContain("remark-gfm@4.0.1");
  });
  it("adds only missing dependencies and does not reinstall compatible ones", async () => {
    const f = await fixture("some");
    await ensureResourcePackages(f.root, f.closure, f.run);
    expect(f.run.mock.calls[0]![1].args).toEqual(["add", "react-markdown@10.1.0"]);
    await ensureResourcePackages(f.root, f.closure, f.run);
    expect(f.run).toHaveBeenCalledTimes(1);
  });
  it("does not invoke a package manager when all dependencies are present and compatible", async () => {
    const f = await fixture("all"); await ensureResourcePackages(f.root, f.closure, f.run);
    expect(f.run).not.toHaveBeenCalled();
  });
  it("does not silently replace an incompatible installed version or direct declaration", async () => {
    const f = await fixture("all");
    const before = await readFile(path.join(f.root, "package.json"), "utf8");
    await installed(f.root, "@assistant-ui/react-generative-ui", "0.0.18");
    await expect(ensureResourcePackages(f.root, f.closure, f.run)).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
    expect(f.run).not.toHaveBeenCalled();
    expect(await readFile(path.join(f.root, "package.json"), "utf8")).toBe(before);
    await installed(f.root, "@assistant-ui/react-generative-ui", "0.0.22");
    const manifest = JSON.parse(before); manifest.dependencies["@assistant-ui/react-generative-ui"] = "0.0.18";
    await writeFile(path.join(f.root, "package.json"), JSON.stringify(manifest));
    await expect(ensureResourcePackages(f.root, f.closure, f.run)).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
    expect(f.run).not.toHaveBeenCalled();
  });
  it("retries a package manager failure without treating partial dependencies as ready", async () => {
    const f = await fixture();
    const failure = vi.fn(async () => { throw new Error("package manager failed"); });
    await expect(ensureResourcePackages(f.root, f.closure, failure)).rejects.toThrow("package manager failed");
    await ensureResourcePackages(f.root, f.closure, f.run);
    expect(f.run).toHaveBeenCalledTimes(1);
  });
  it("rejects an apparent successful install whose package requirements remain unmet", async () => {
    const f = await fixture();
    await expect(ensureResourcePackages(f.root, f.closure, async () => {})).rejects.toMatchObject({ code: "RESOURCE_INSTALL_FAILED" });
  });
  it("restores absent node_modules without changing compatible existing declarations", async () => {
    const f = await fixture("all");
    await rm(path.join(f.root, "node_modules"), { recursive: true });
    const run = vi.fn(async (_root: string, command: ResourcePackageCommand) => {
      expect(command.args).toEqual(["install"]);
      for (const [name, range] of Object.entries(f.requirements)) await installed(f.root, name, minVersion(range)!.version);
    });
    const before = await readFile(path.join(f.root, "package.json"), "utf8");
    await ensureResourcePackages(f.root, f.closure, run);
    expect(await readFile(path.join(f.root, "package.json"), "utf8")).toBe(before);
  });
  it.each([["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"], ["bun.lock", "bun"], ["bun.lockb", "bun"]])("detects %s without overriding packageManager", async (file, manager) => {
    const f = await fixture();
    await writeFile(path.join(f.root, file), "");
    expect(await detectResourcePackageManager(f.root)).toBe("pnpm");
    await writeFile(path.join(f.root, "package.json"), "{}");
    expect(await detectResourcePackageManager(f.root)).toBe(manager);
  });
});

it("uses the enclosing workspace's manager while leaving dependencies on the selected project", async () => {
  const f = await fixture();
  await writeFile(path.join(f.root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  const child = path.join(f.root, "apps/host"); await mkdir(child, { recursive: true });
  await writeFile(path.join(child, "package.json"), "{}");
  expect(await detectResourcePackageManager(child)).toBe("pnpm");
});

it("preserves compatible workspace and local declarations", async () => {
  const f = await fixture("all");
  const manifestPath = path.join(f.root, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.dependencies["@agent-ui/react"] = "workspace:^";
  manifest.dependencies["@agent-ui/runtime-react"] = "file:../runtime-react";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await ensureResourcePackages(f.root, f.closure, f.run);
  expect(f.run).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(manifestPath, "utf8")).dependencies).toEqual(manifest.dependencies);
});
