import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createCreatorCommandHandler } from "../src/commands/command-api.js";
import type { CreatorWorkspaceManager } from "../src/workspace/CreatorWorkspaceManager.js";

it("uses the actual Operator to prepare missing files without writes, then completes only a confirmed preparation", async () => {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const root = await mkdtemp(path.join(tmpdir(), "creator enable 集成-"));
  const servers: ReturnType<typeof createServer>[] = [];
  const listen = async (server: ReturnType<typeof createServer>) => {
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    return (server.address() as AddressInfo).port;
  };
  try {
    const host = path.join(repository, "examples/creator-host-sandbox");
    await mkdir(path.join(root, ".agent-ui"));
    await mkdir(path.join(root, "src/ui/app-ui"), { recursive: true });
    await writeFile(path.join(root, "package.json"), await readFile(path.join(host, "package.json")));
    await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "assistant", sourceRoot: "src/ui" }));
    const model = JSON.stringify({ root: { type: "slot", plugins: [] } });
    await writeFile(path.join(root, "src/ui/app-ui/app-ui.json"), model);
    const guardPort = await listen(createServer(async (request, response) => {
      let data = ""; for await (const chunk of request) data += chunk;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(JSON.parse(data).action === "acquire" ? { token: "held" } : { released: true }));
    }));
    const workspaces = {
      hasActiveCreatorRequests: () => false,
      ensureCreatorRuntime: () => ({ ensureStarted: async () => ({ host: "127.0.0.1", port: guardPort, authToken: "secret" }) }),
      runProjectOperation: async (id: string, run: (directory: string) => unknown) => {
        if (id !== "isolated") throw new Error("CREATOR_WORKSPACE_CHANGED");
        return run(root);
      },
    } as unknown as CreatorWorkspaceManager;
    const port = await listen(createServer(createCreatorCommandHandler(workspaces, undefined, undefined)));
    const execute = async (args: object) => {
      const response = await fetch(`http://127.0.0.1:${port}/execute`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-agent-ui-workspace-id": "isolated" },
        body: JSON.stringify({ id: "enable", args }),
      });
      return { status: response.status, body: await response.json() };
    };
    const first = await execute({ pluginId: "composer" });
    expect(first.body).toMatchObject({ status: "confirmation-required", changed: false, preparation: { packages: [] } });
    const entry = path.join(root, "src/ui/plugins/composer/index.tsx");
    await expect(readFile(entry)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await execute({ pluginId: "composer", preparationId: "forged" })).status).toBe(409);
    await expect(readFile(entry)).rejects.toMatchObject({ code: "ENOENT" });
    const result = await execute({ pluginId: "composer", preparationId: first.body.preparation.id });
    expect(result.body).toMatchObject({ status: "agent-required", addPluginId: "composer", changed: true, receipt: { verification: { status: "changed-unverified" } } });
    expect(await readFile(entry, "utf8")).toContain("ConversationComposerPlugin");
    expect(await readFile(path.join(root, "src/ui/app-ui/app-ui.json"), "utf8")).toBe(model);
    expect((await execute({ pluginId: "composer", preparationId: first.body.preparation.id })).status).toBe(409);
  } finally {
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
