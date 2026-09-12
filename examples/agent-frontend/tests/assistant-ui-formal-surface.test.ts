import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(projectRoot, "../..");
const vendorRoot = path.join(projectRoot, "agent-ui/vendor/assistant-ui");
const registryItemPath = path.join(
  workspaceRoot,
  "packages/source-registry/registry/items/foundation-assistant-ui-conversation/item.json",
);
const registryItemRoot = path.dirname(registryItemPath);
const itemId = "foundation/assistant-ui-conversation";
const revision = "97bd4b39fce83163354c9ec8d9d4fb2c9bd1aac7";

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function collectRelativeFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(current, entry.name);
    return entry.isDirectory()
      ? collectRelativeFiles(root, entryPath)
      : [path.relative(root, entryPath).split(path.sep).join("/")];
  }));
  return files.flat().sort();
}

describe("formal assistant-ui surface", () => {
  it("owns presentation composition without creating a Runtime", async () => {
    const surface = await readFile(
      path.join(
        projectRoot,
        "agent-ui/adapters/assistant-ui/conversation/AssistantUiConversationSurface.tsx",
      ),
      "utf8",
    );

    expect(surface).toContain("../../../vendor/assistant-ui/components/assistant-ui/elements/thread.aui");
    expect(surface).toContain("../../../vendor/assistant-ui/components/ui/tooltip");
    expect(surface).toContain('data-agent-ui-assistant-ui="true"');
    expect(surface).toContain('export type AssistantUiConversationTheme = "light" | "dark"');
    expect(surface).toContain("theme?: AssistantUiConversationTheme");
    expect(surface).toContain('theme = "light"');
    expect(surface).toContain('theme === "dark" ? "dark" : undefined');
    expect(surface).toContain("data-theme={theme}");
    expect(surface).toContain("<TooltipProvider>");
    expect(surface).toContain("presentation={presentation}");
    expect(surface).not.toMatch(
      /@ag-ui\/client|@assistant-ui\/react-ag-ui|AgentRuntime|AppUIModel|PluginRegistry/u,
    );
  });

  it("keeps provenance, Registry targets, installed files, and lock hashes aligned", async () => {
    const upstream = JSON.parse(
      await readFile(path.join(vendorRoot, "UPSTREAM.json"), "utf8"),
    ) as {
      revision: string;
      files: Array<{ localPath: string; installedSha256: string }>;
      patches: Array<{ id: string }>;
    };
    const item = JSON.parse(await readFile(registryItemPath, "utf8")) as {
      version: string;
      upstream: { revision: string; license: string; mode: string };
      files: Array<{ source: string; target: string }>;
    };
    const lock = JSON.parse(
      await readFile(path.join(projectRoot, ".agent-ui/source-lock.json"), "utf8"),
    ) as {
      items: Record<string, { files: Record<string, { sha256: string }> }>;
    };

    expect(upstream.revision).toBe(revision);
    expect(upstream.patches).toEqual([
      expect.objectContaining({ id: "p3r3-semantic-slot-seams" }),
      expect.objectContaining({ id: "p3r4b-welcome-presentation-config" }),
      expect.objectContaining({ id: "p3r4c-composer-extension-seam" }),
      expect.objectContaining({ id: "p3r4d-thread-list-policy-seam" }),
    ]);
    expect(item.version).toBe("0.1.6");
    expect(item.upstream).toMatchObject({
      revision,
      license: "MIT",
      mode: "adapted",
    });

    const presentationFiles = (await collectRelativeFiles(vendorRoot)).filter(
      (file) => file !== "THIRD_PARTY_NOTICES.md" && file !== "UPSTREAM.json",
    );
    expect(presentationFiles).toEqual(
      upstream.files.map((file) => file.localPath).sort(),
    );
    expect(presentationFiles).toContain(
      "components/assistant-ui/elements/composer-trigger-popover.aui.tsx",
    );
    expect(presentationFiles).toContain(
      "components/assistant-ui/elements/thread-list.aui.tsx",
    );
    expect(presentationFiles).toContain("components/ui/input.tsx");

    const lockFiles = lock.items[itemId]?.files;
    expect(lockFiles).toBeDefined();
    for (const file of upstream.files) {
      const content = await readFile(path.join(vendorRoot, file.localPath));
      const installedHash = sha256(content);
      expect(installedHash, file.localPath).toBe(file.installedSha256);
      expect(lockFiles?.[`vendor/assistant-ui/${file.localPath}`]?.sha256).toBe(
        installedHash,
      );
    }

    for (const file of item.files) {
      expect(
        await readFile(path.join(projectRoot, "agent-ui", file.target)),
        file.target,
      ).toEqual(await readFile(path.join(registryItemRoot, file.source)));
    }

    expect(Object.keys(lockFiles ?? {}).sort()).toEqual(
      item.files.map((file) => file.target).sort(),
    );
  });
});
