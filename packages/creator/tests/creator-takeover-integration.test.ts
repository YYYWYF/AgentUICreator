import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { initializeAgentUIProject } from "@za38.03/agent-ui-creator/bootstrap";
import { createAgentUIInitializationHost } from "@za38.03/agent-ui-creator/project/dev";
import { createCreatorCommandHandler } from "../src/commands/command-api.js";
import type { CreatorWorkspaceManager } from "../src/workspace/CreatorWorkspaceManager.js";
import type { CreatorCommandCatalog, CreatorCommandResult } from "../src/commands/types.js";

it("takes over the project's exact installed source without an Agent, preserving application edits and rejecting stale consent", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const root = await mkdtemp(path.join(tmpdir(), "Creator takeover 中文 空格-"));
  const servers: ReturnType<typeof createServer>[] = [];
  const listen = async (server: ReturnType<typeof createServer>) => {
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    return (server.address() as AddressInfo).port;
  };
  try {
    const host = path.join(repository, "examples/creator-host-sandbox");
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "package.json"), await readFile(path.join(host, "package.json")));
    const link = async (source: string, destination: string) => {
      await mkdir(path.dirname(destination), { recursive: true });
      await symlink(source, destination, process.platform === "win32" ? "junction" : "dir");
    };
    // Give this isolated project its own Plugins installation and a different version.
    const sourcePackage = path.join(repository, "packages/plugins");
    const installed = path.join(root, "node_modules/@za38.03/agent-ui-plugins");
    await cp(path.join(sourcePackage, "dist"), path.join(installed, "dist"), { recursive: true });
    await link(path.join(sourcePackage, "node_modules"), path.join(installed, "node_modules"));
    const metadata = JSON.parse(await readFile(path.join(sourcePackage, "package.json"), "utf8")) as { version: string; dependencies: Record<string, string>; peerDependencies: Record<string, string> };
    metadata.version = "99.8.7";
    await writeFile(path.join(installed, "package.json"), JSON.stringify(metadata));
    const catalogPath = path.join(installed, "dist/catalog.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as { package: { version: string }; plugins: { id: string; takeover: { files: { target: string; path: string }[] } }[] };
    catalog.package.version = metadata.version;
    await writeFile(catalogPath, JSON.stringify(catalog));
    const dependencies = { ...metadata.peerDependencies, ...metadata.dependencies };
    for (const name of Object.keys(dependencies)) {
      if (name === "@za38.03/agent-ui-plugins") continue;
      await link(path.join(sourcePackage, "node_modules", name), path.join(root, "node_modules", name));
      if (dependencies[name]?.startsWith("workspace:")) {
        const pkg = JSON.parse(await readFile(path.join(root, "node_modules", name, "package.json"), "utf8")) as { version: string };
        dependencies[name] = pkg.version;
      }
    }
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };
    manifest.dependencies = { ...manifest.dependencies, ...dependencies, "@za38.03/agent-ui-plugins": metadata.version };
    await writeFile(path.join(root, "package.json"), JSON.stringify(manifest));
    await initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "src/ui" }, createAgentUIInitializationHost());
    const applicationPath = path.join(root, "src/ui/plugins/composer/index.tsx");
    const application = (await readFile(applicationPath, "utf8")).replaceAll("\n", "\r\n") + "// Keep project customization\r\n";
    await writeFile(applicationPath, application);
    const modelPath = path.join(root, "src/ui/app-ui.json"), model = await readFile(modelPath, "utf8");
    const runtimeRequests: string[] = [];
    let guardBusy = false, activeAgent = false;
    const guardPort = await listen(createServer(async (request, response) => {
      runtimeRequests.push(request.url ?? "");
      let data = ""; for await (const chunk of request) data += chunk;
      response.setHeader("Content-Type", "application/json");
      if (guardBusy || request.url !== "/creator-command-mutation") {
        response.writeHead(409); response.end(JSON.stringify({ code: "CREATOR_COMMAND_BUSY" })); return;
      }
      const input = JSON.parse(data) as { action: string };
      response.end(JSON.stringify(input.action === "acquire" ? { token: "held" } : { released: true }));
    }));
    const workspaces = {
      hasActiveCreatorRequests: () => activeAgent,
      ensureCreatorRuntime: () => ({ ensureStarted: async () => ({ host: "127.0.0.1", port: guardPort, authToken: "secret" }) }),
      runProjectOperation: async (id: string, run: (directory: string) => unknown) => {
        if (!["isolated", "other-workspace"].includes(id)) throw new Error("CREATOR_WORKSPACE_CHANGED");
        return run(root);
      },
    } as unknown as CreatorWorkspaceManager;
    const port = await listen(createServer(createCreatorCommandHandler(workspaces, undefined, undefined)));
    const headers = { "Content-Type": "application/json", "x-agent-ui-workspace-id": "isolated" };
    const execute = async (args: object, workspaceId = "isolated") => {
      const response = await fetch(`http://127.0.0.1:${port}/execute`, { method: "POST", headers: { ...headers, "x-agent-ui-workspace-id": workspaceId }, body: JSON.stringify({ id: "takeover", args }) });
      return { status: response.status, body: await response.json() as CreatorCommandResult & { code?: string } };
    };
    const targets = async () => {
      const response = await fetch(`http://127.0.0.1:${port}/`, { headers });
      const body = await response.json() as CreatorCommandCatalog;
      expect(response.status, JSON.stringify(body)).toBe(200);
      return body.commands.find(command => command.id === "takeover")!.options.map(option => option.id);
    };
    expect(await targets()).toContain("composer");
    expect(await targets()).not.toContain("skills"); // No project application exists yet.
    const plan = async () => {
      const result = await execute({ pluginId: "composer" });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body).toMatchObject({ status: "confirmation-required", changed: false, takeover: { plan: { package: { version: "99.8.7" }, dependencyChanges: [] } } });
      return result.body.takeover!;
    };
    const sourceDirectory = path.join(root, "src/ui/plugins/composer/source");
    await plan();
    expect(runtimeRequests).toEqual([]);
    await expect(readdir(sourceDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(applicationPath, "utf8")).toBe(application);
    expect((await execute({ pluginId: "composer", preparationId: "forged" })).body.code).toBe("PLUGIN_SOURCE_PLAN_STALE");
    expect((await execute({ pluginId: "composer", confirmed: true })).body.code).toBe("CREATOR_COMMAND_REQUEST_INVALID");
    const expired = await plan();
    const time = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60_000);
    try {
      expect((await execute({ pluginId: "composer", preparationId: expired.id })).body.code).toBe("PLUGIN_SOURCE_PLAN_STALE");
    } finally { time.mockRestore(); }
    const wrongWorkspace = await plan();
    expect((await execute({ pluginId: "composer", preparationId: wrongWorkspace.id }, "other-workspace")).body.code).toBe("PLUGIN_SOURCE_PLAN_STALE");
    const stale = await plan();
    await writeFile(applicationPath, application + "// Concurrent edit\r\n");
    expect((await execute({ pluginId: "composer", preparationId: stale.id })).body.code).toBe("PLUGIN_SOURCE_PLAN_STALE");
    await expect(readdir(sourceDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(applicationPath, application);
    const changedPackage = await plan();
    await writeFile(catalogPath, JSON.stringify({ ...catalog, changedSincePlan: true }));
    expect((await execute({ pluginId: "composer", preparationId: changedPackage.id })).body.code).toBe("PLUGIN_SOURCE_PLAN_STALE");
    await writeFile(catalogPath, JSON.stringify(catalog));
    activeAgent = true;
    expect((await execute({ pluginId: "composer" })).body.code).toBe("CREATOR_COMMAND_BUSY");
    activeAgent = false;
    const blocked = await plan(); guardBusy = true;
    expect((await execute({ pluginId: "composer", preparationId: blocked.id })).body.code).toBe("CREATOR_COMMAND_BUSY");
    guardBusy = false;
    const confirmed = await plan();
    const result = await execute({ pluginId: "composer", preparationId: confirmed.id });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body).toMatchObject({ changed: true, value: "composer", receipt: { validations: [], verification: { status: "changed-unverified" } } });
    expect(await readFile(applicationPath, "utf8")).toBe(application.replace("@za38.03/agent-ui-plugins/composer", "./source/index"));
    expect(await readFile(modelPath, "utf8")).toBe(model);
    const ownership = JSON.parse(await readFile(path.join(root, ".agent-ui/plugin-ownership.json"), "utf8")) as { plugins: { composer: { package: { version: string }; approvedPlanHash: string } } };
    expect(ownership.plugins.composer.package.version).toBe("99.8.7");
    expect(ownership.plugins.composer.approvedPlanHash).toBe(confirmed.plan.planHash);
    const source = catalog.plugins.find(plugin => plugin.id === "composer")!.takeover.files.find(file => file.target === "index.tsx")!;
    expect(await readFile(path.join(sourceDirectory, "index.tsx"), "utf8")).toBe(await readFile(path.join(installed, "dist", ...source.path.split("/")), "utf8"));
    expect(await targets()).toContain("composer");
    const overwrite = await plan();
    expect(overwrite.plan.overwriteDirectory).toBe("src/ui/plugins/composer/source");
    await rm(sourceDirectory, { recursive: true, force: true });
    const restore = await plan();
    expect(restore.plan.overwriteDirectory).toBeUndefined();
    expect((await execute({ pluginId: "composer", preparationId: restore.id })).body.changed).toBe(true);
    expect(await readFile(path.join(sourceDirectory, "index.tsx"), "utf8")).toBe(await readFile(path.join(installed, "dist", ...source.path.split("/")), "utf8"));
    expect(await readFile(applicationPath, "utf8")).toBe(application.replace("@za38.03/agent-ui-plugins/composer", "./source/index"));
    expect((await execute({ pluginId: "composer", preparationId: confirmed.id })).body.code).toBe("PLUGIN_SOURCE_PLAN_STALE");
    expect(runtimeRequests.length).toBeGreaterThan(0);
    expect(runtimeRequests.every(url => url === "/creator-command-mutation")).toBe(true);
  } finally {
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
