import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { initializeAgentUIProject } from "@za38.03/agent-ui-creator/bootstrap";
import { createAgentUIInitializationHost } from "@za38.03/agent-ui-creator/project/dev";
import { createCreatorCommandHandler } from "../src/commands/command-api.js";
import type { CreatorWorkspaceManager } from "../src/workspace/CreatorWorkspaceManager.js";
import type { CreatorCommandResult } from "../src/commands/types.js";

it("adds slash without a model and leaves prepared files with a notice when the default Slot is occupied", async () => {
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
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "package.json"), await readFile(path.join(host, "package.json")));
    await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    await initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "src/ui" }, createAgentUIInitializationHost());
    const modelPath = path.join(root, "src/ui/app-ui.json");
    const model = await readFile(modelPath, "utf8");
    const runtimeRequests: string[] = [];
    let guardBusy = false;
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
      return { status: response.status, body: await response.json() as CreatorCommandResult & { code?: string } };
    };
    const first = await execute({ pluginId: "slash-command-trigger" });
    expect(first.body).toMatchObject({ status: "confirmation-required", changed: false, preparation: { packages: [] } });
    const preparationId = first.body.preparation!.id;
    const entry = path.join(root, "src/ui/plugins/slash-command-trigger/index.tsx");
    await expect(readFile(entry)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(modelPath, "utf8")).toBe(model);
    expect((await execute({ pluginId: "slash-command-trigger", preparationId: "forged" })).status).toBe(409);
    await expect(readFile(entry)).rejects.toMatchObject({ code: "ENOENT" });
    const result = await execute({ pluginId: "slash-command-trigger", preparationId });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ value: "slash-command-trigger", changed: true, receipt: { verification: { status: "changed-and-statically-verified" } } });
    expect(result.body.status).toBeUndefined();
    expect(result.body.receipt.files.map(file => file.path)).toContain("src/ui/app-ui.json");
    expect(await readFile(entry, "utf8")).toContain("ConversationSlashCommandTrigger");
    expect(await readFile(modelPath, "utf8")).toContain('"slash-command-trigger"');
    expect((await execute({ pluginId: "slash-command-trigger", preparationId })).status).toBe(409);

    // Existing application files skip confirmation, while the runtime guard still protects writes.
    const addedModel = await readFile(modelPath, "utf8");
    await writeFile(modelPath, model);
    guardBusy = true;
    expect((await execute({ pluginId: "slash-command-trigger" })).body.code).toBe("CREATOR_COMMAND_BUSY");
    expect(await readFile(modelPath, "utf8")).toBe(model);
    guardBusy = false;
    const ready = await execute({ pluginId: "slash-command-trigger" });
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ changed: true });
    expect(await readFile(modelPath, "utf8")).toBe(addedModel);

    // tool-result already occupies the single toolFallback Slot. Preparation still completes.
    const registryPath = path.join(root, "src/ui/plugins/registry.generated.ts");
    const beforeRegistry = await readFile(registryPath, "utf8");
    const pendingFallback = await execute({ pluginId: "tool-fallback" });
    expect(pendingFallback.body.status).toBe("confirmation-required");
    const fallback = await execute({ pluginId: "tool-fallback", preparationId: pendingFallback.body.preparation!.id });
    expect(fallback.status).toBe(200);
    expect(fallback.body).toMatchObject({ status: "placement-required", value: "tool-fallback", changed: true,
      receipt: { verification: { status: "changed-unverified", checks: [{ id: "default-placement", status: "unavailable" }] } } });
    expect(fallback.body.receipt.files.every(file => file.status === "created")).toBe(true);
    expect(fallback.body.receipt.verification?.checks[0]?.evidence).toContain("slot-cardinality-full");
    expect(fallback.body.placementGuide).toMatchObject({ modelPath: "src/ui/app-ui.json", pluginId: "tool-fallback",
      target: { parentPluginId: "conversation-surface", slot: "toolFallback", cardinality: "one" } });
    expect(fallback.body.placementGuide?.example).toContain('"pluginId": "tool-fallback"');
    const fallbackEntry = path.join(root, "src/ui/plugins/tool-fallback/index.tsx");
    expect(await readFile(fallbackEntry, "utf8")).toContain("ToolFallback");
    expect(await readFile(modelPath, "utf8")).toBe(addedModel);
    expect(await readFile(registryPath, "utf8")).toBe(beforeRegistry);
    const retry = await execute({ pluginId: "tool-fallback" });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ status: "placement-required", changed: false,
      receipt: { files: [], verification: { status: "no-project-change" } } });
    expect(retry.body.placementGuide).toEqual(fallback.body.placementGuide);

    guardBusy = true;
    expect((await execute({ pluginId: "tool-fallback" })).body.code).toBe("CREATOR_COMMAND_BUSY");
    guardBusy = false;
    expect(runtimeRequests.length).toBeGreaterThan(0);
    expect(runtimeRequests.every(url => url === "/creator-command-mutation")).toBe(true);
  } finally {
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
