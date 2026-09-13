import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, expect, it, afterEach } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = path.join(projectRoot, "agent-ui/vendor/assistant-ui");
const guardScript = path.join(projectRoot, "scripts/check-assistant-ui-upstream.mjs");
const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe("assistant-ui upstream ownership guard", () => {
  it("configures the official Base UI Registry and protects the declared set", async () => {
    const components = JSON.parse(
      await readFile(path.join(projectRoot, "components.json"), "utf8"),
    ) as {
      style?: string;
      registries?: Record<string, string>;
    };
    expect(components.style).toBe("base-nova");
    expect(components.registries?.["@assistant-ui"]).toBe(
      "https://r.assistant-ui.com/styles/{style}/{name}.json",
    );
    await expect(execFileAsync("node", [guardScript, "--vendor-root", vendorRoot])).resolves.toMatchObject({
      stdout: expect.stringContaining("assistant-ui upstream-owned Elements: OK"),
    });
  });

  it("fails when an upstream-owned Element is modified", async () => {
    const temporaryRoot = await mkdtemp(path.join(projectRoot, ".tmp-upstream-guard-"));
    temporaryRoots.push(temporaryRoot);
    await cp(vendorRoot, temporaryRoot, { recursive: true });

    const target = path.join(
      temporaryRoot,
      "components/assistant-ui/elements/tool-group.aui.tsx",
    );
    const source = await readFile(target, "utf8");
    await writeFile(target, `${source}\n// product drift\n`);

    await expect(
      execFileAsync("node", [guardScript, "--vendor-root", temporaryRoot]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        "assistant-ui upstream-owned Element modified: components/assistant-ui/elements/tool-group.aui.tsx",
      ),
    });
  });
});
