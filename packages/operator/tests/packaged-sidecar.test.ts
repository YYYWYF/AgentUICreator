import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePackagedSidecar } from "../src/python/packaged-sidecar.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(platform = "win32", architecture = "x64") {
  const root = await mkdtemp(path.join(tmpdir(), "creator sidecar 中文 "));
  temporary.push(root);
  const name = `@za38.03/agent-ui-creator-${platform}-${architecture}`;
  const creatorRoot = path.join(root, "creator"), sidecarRoot = path.join(root, "platform");
  await mkdir(path.join(creatorRoot, "dist"), { recursive: true });
  await mkdir(path.join(sidecarRoot, "dist/agent/agent_ui_creator"), { recursive: true });
  await mkdir(path.join(sidecarRoot, "dist/python"), { recursive: true });
  await writeFile(path.join(creatorRoot, "package.json"), JSON.stringify({ optionalDependencies: { [name]: "2.3.4" } }));
  await writeFile(path.join(creatorRoot, "dist/python-sidecar.json"), JSON.stringify({ schemaVersion: 1, sourceHash: "reviewed-agent-source" }));
  await writeFile(path.join(sidecarRoot, "package.json"), JSON.stringify({ name, version: "2.3.4", os: [platform], cpu: [architecture] }));
  await writeFile(path.join(sidecarRoot, "dist/python/python.exe"), "fixture-binary");
  await writeFile(path.join(sidecarRoot, "dist/agent/agent_ui_creator/server.py"), "");
  const descriptor = path.join(sidecarRoot, "sidecar.json");
  await writeFile(descriptor, JSON.stringify({ schemaVersion: 1, name, version: "2.3.4", platform, arch: architecture,
    sourceHash: "reviewed-agent-source", executable: "dist/python/python.exe", pythonPackageRoot: "dist/agent" }));
  return { root, creatorRoot, sidecarRoot, descriptor, options: { platform: platform as NodeJS.Platform, architecture, creatorRoot,
    resolvePackage: () => path.join(sidecarRoot, "package.json") } };
}

describe("installed Creator platform runtime", () => {
  it("resolves the platform from Creator's dependency tree when Operator has no Python dependency", async () => {
    const f = await fixture();
    const installed = path.join(f.creatorRoot, "node_modules/@za38.03/agent-ui-creator-win32-x64");
    await mkdir(path.dirname(installed), { recursive: true });
    await rename(f.sidecarRoot, installed);
    const resolved = await resolvePackagedSidecar({ platform: "win32", architecture: "x64", creatorRoot: f.creatorRoot });
    expect(resolved.executable.toLowerCase()).toBe(path.toNamespacedPath(path.join(installed, "dist/python/python.exe")).toLowerCase());
  });
  it("locates a matching bundled interpreter and Agent in paths with spaces and Unicode", async () => {
    const f = await fixture();
    const resolved = await resolvePackagedSidecar(f.options);
    expect(resolved.executable.toLowerCase()).toBe(path.toNamespacedPath(path.join(f.sidecarRoot, "dist/python/python.exe")).toLowerCase());
    expect(resolved.pythonPackageRoot.toLowerCase()).toBe(path.toNamespacedPath(path.join(f.sidecarRoot, "dist/agent")).toLowerCase());
  });
  it("reports skipped optional dependencies without downloading or falling back to system Python", async () => {
    const f = await fixture();
    await expect(resolvePackagedSidecar({ ...f.options, resolvePackage: () => { throw new Error("not installed"); } }))
      .rejects.toMatchObject({ code: "CREATOR_SIDECAR_PACKAGE_MISSING" });
  });
  it("rejects unsupported OS/CPU combinations", async () => {
    const f = await fixture();
    await expect(resolvePackagedSidecar({ ...f.options, architecture: "arm64" })).rejects.toMatchObject({ code: "CREATOR_SIDECAR_PLATFORM_UNSUPPORTED" });
  });
  it.each(["version", "sourceHash", "arch", "name"])("rejects incompatible %s", async field => {
    const f = await fixture();
    const descriptor = JSON.parse(await readFile(f.descriptor, "utf8"));
    descriptor[field] = "different";
    await writeFile(f.descriptor, JSON.stringify(descriptor));
    await expect(resolvePackagedSidecar(f.options)).rejects.toMatchObject({ code: "CREATOR_SIDECAR_PACKAGE_INVALID" });
  });
  it.each(["../outside", "C:/python.exe", "dist\\python\\python.exe", "/absolute"])("rejects invalid logical path %s", async executable => {
    const f = await fixture();
    const descriptor = JSON.parse(await readFile(f.descriptor, "utf8"));
    await writeFile(f.descriptor, JSON.stringify({ ...descriptor, executable }));
    await expect(resolvePackagedSidecar(f.options)).rejects.toMatchObject({ code: "CREATOR_SIDECAR_PACKAGE_INVALID" });
  });
  it("rejects a partially installed runtime", async () => {
    const f = await fixture();
    await rm(path.join(f.sidecarRoot, "dist/python/python.exe"));
    await expect(resolvePackagedSidecar(f.options)).rejects.toMatchObject({ code: "CREATOR_SIDECAR_PACKAGE_INVALID" });
  });
});
