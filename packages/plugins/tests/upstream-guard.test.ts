import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, expect, it, afterEach } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = path.join(packageRoot, "src/internal/vendor/assistant-ui");
const guardScript = path.join(packageRoot, "scripts/check-assistant-ui-upstream.mjs");
const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

async function copyGuardFixture(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(packageRoot, prefix));
  temporaryRoots.push(root);
  const internalRoot = path.join(root, "internal");
  const fixtureVendorRoot = path.join(internalRoot, "vendor/assistant-ui");
  await mkdir(path.dirname(fixtureVendorRoot), { recursive: true });
  await cp(vendorRoot, fixtureVendorRoot, { recursive: true });
  for (const file of ["quote-selection-UPSTREAM.json", "quote-selection-root.tsx",
    "quote-selection-action.tsx", "quote-selection-message-id.ts",
    "composer-trigger-UPSTREAM.json", "trigger-matcher.ts"]) {
    await cp(path.join(packageRoot, "src/internal", file), path.join(internalRoot, file));
  }
  return fixtureVendorRoot;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe("assistant-ui upstream ownership guard", () => {
  it("configures the official Base UI Registry and protects the declared set", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(vendorRoot, "upstream-elements.json"), "utf8"),
    ) as {
      source?: string;
      style?: string;
      owned?: string[];
      legacyExceptions?: string[];
    };
    expect(manifest.source).toBe("https://r.assistant-ui.com");
    expect(manifest.style).toBe("base-nova");
    expect(manifest.owned).toEqual(expect.arrayContaining([
      "components/assistant-ui/elements/thread-list.aui.tsx",
      "components/assistant-ui/elements/attachment.aui.tsx",
      "components/assistant-ui/elements/task-card.aui.tsx",
      "components/assistant-ui/elements/task-card.tsx",
    ]));
    const lock = JSON.parse(await readFile(
      path.join(vendorRoot, "assistant-ui-upstream.lock.json"), "utf8",
    )) as { elements: Record<string, string> };
    expect([...(manifest.owned ?? [])].sort()).toEqual(Object.keys(lock.elements).sort());
    expect(manifest.legacyExceptions).toEqual([]);
    await expect(execFileAsync("node", [guardScript, "--vendor-root", vendorRoot])).resolves.toMatchObject({
      stdout: expect.stringContaining("assistant-ui upstream-owned Elements: OK"),
    });
  });

  it.each([
    "thread-list.aui.tsx",
    "attachment.aui.tsx",
    "task-card.aui.tsx",
    "task-card.tsx",
  ])("fails when an upstream-owned Element is modified: %s", async (fileName) => {
    const temporaryRoot = await copyGuardFixture(".tmp-upstream-element-guard-");

    const target = path.join(
      temporaryRoot,
      "components/assistant-ui/elements",
      fileName,
    );
    const source = await readFile(target, "utf8");
    await writeFile(target, `${source}\n// product drift\n`);

    await expect(
      execFileAsync("node", [guardScript, "--vendor-root", temporaryRoot]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        `assistant-ui upstream-owned Element modified: components/assistant-ui/elements/${fileName}`,
      ),
    });
  });

  it("fails when the upstream-owned Thread is modified", async () => {
    const temporaryRoot = await copyGuardFixture(".tmp-upstream-thread-guard-");

    const target = path.join(
      temporaryRoot,
      "components/assistant-ui/elements/thread.aui.tsx",
    );
    const source = await readFile(target, "utf8");
    await writeFile(target, `${source}\n// product drift\n`);

    await expect(
      execFileAsync("node", [guardScript, "--vendor-root", temporaryRoot]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        "assistant-ui upstream-owned Element modified: components/assistant-ui/elements/thread.aui.tsx",
      ),
    });
  });

  it("fails when an approved non-Element Portal bridge drifts from its installed hash", async () => {
    const temporaryRoot = await copyGuardFixture(".tmp-upstream-portal-guard-");
    const target = path.join(temporaryRoot, "components/ui/dialog.tsx");
    await writeFile(target, `${await readFile(target, "utf8")}\n// product drift\n`);
    await expect(execFileAsync("node", [guardScript, "--vendor-root", temporaryRoot]))
      .rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining("assistant-ui tracked vendor file modified: components/ui/dialog.tsx"),
      });
  });

  it("keeps the vendored Thread imports mechanically adapted", async () => {
    const thread = await readFile(
      path.join(vendorRoot, "components/assistant-ui/elements/thread.aui.tsx"),
      "utf8",
    );

    expect(thread).not.toMatch(/from "@\/components\//u);
    expect(thread).not.toMatch(/from "@\/lib\//u);
    expect(thread).toContain('from "./reasoning.aui"');
    expect(thread).toContain('from "../../ui/button"');
    expect(thread).toContain('from "../../../lib/utils"');
  });

  it("fails when an Element is added without an ownership declaration", async () => {
    const temporaryRoot = await copyGuardFixture(".tmp-upstream-unclassified-");

    await writeFile(
      path.join(
        temporaryRoot,
        "components/assistant-ui/elements/product-drift.tsx",
      ),
      "export {}\n",
    );

    await expect(
      execFileAsync("node", [guardScript, "--vendor-root", temporaryRoot]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        "Unclassified assistant-ui Element: components/assistant-ui/elements/product-drift.tsx",
      ),
    });
  });

  it("fails when an upstream-owned Element is removed from the lock", async () => {
    const temporaryRoot = await copyGuardFixture(".tmp-upstream-lock-");

    const lockPath = path.join(temporaryRoot, "assistant-ui-upstream.lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
      elements: Record<string, string>;
    };
    delete lock.elements["components/assistant-ui/elements/attachment.aui.tsx"];
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    await expect(
      execFileAsync("node", [guardScript, "--vendor-root", temporaryRoot]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        "Missing upstream lock entries: components/assistant-ui/elements/attachment.aui.tsx",
      ),
    });
  });
});
