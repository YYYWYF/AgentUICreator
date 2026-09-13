import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = path.join(projectRoot, "agent-ui/vendor/assistant-ui");

describe("assistant-ui upstream provenance", () => {
  it("records the resolved assistant-ui main revision and runtime package versions", async () => {
    const provenance = await readFile(path.join(vendorRoot, "UPSTREAM.md"), "utf8");
    const metadata = JSON.parse(await readFile(path.join(vendorRoot, "UPSTREAM.json"), "utf8")) as {
      revision?: string;
      files?: Array<{ localPath: string }>;
    };

    expect(provenance).toContain("Repository: https://github.com/assistant-ui/assistant-ui");
    expect(provenance).toContain("Branch: `main`");
    expect(provenance).toMatch(/Commit: `[0-9a-f]{40}`/u);
    expect(provenance).toContain("@assistant-ui/react` = `0.15.19");
    expect(provenance).toContain("@assistant-ui/react-ag-ui` = `0.0.59");
    expect(provenance).toContain("@assistant-ui/react-markdown` = `0.14.15");
    expect(provenance).toContain("@ag-ui/client` = `0.0.59");
    expect(metadata.revision).toBe("bd7e8fa9f79ffea10fab0741026d53cdba4cfa70");
    expect(provenance).toContain(metadata.revision);
  });

  it("keeps the core vendored assistant-ui presentation files present", async () => {
    const metadata = JSON.parse(await readFile(path.join(vendorRoot, "UPSTREAM.json"), "utf8")) as {
      files?: Array<{ localPath: string }>;
    };
    const coreFiles = [
      "components/assistant-ui/elements/thread.aui.tsx",
      "components/assistant-ui/elements/thread-list.aui.tsx",
      "components/assistant-ui/elements/composer-trigger-popover.aui.tsx",
      "components/ui/button.tsx",
      "components/ui/input.tsx",
      "components/ui/separator.tsx",
      "components/ui/sheet.tsx",
      "components/ui/sidebar.tsx",
      "components/assistant-ui/elements/tool-call.tsx",
      "components/assistant-ui/elements/sources.aui.tsx",
      "components/assistant-ui/elements/surfaces.tsx",
      "components/ui/badge.tsx",
      "components/assistant-ui/elements/agent-plan.tsx",
      "components/assistant-ui/elements/agent-status.tsx",
      "components/assistant-ui/elements/subagent-list.tsx",
      "components/assistant-ui/utils/range.ts",
      "hooks/use-mobile.ts",
    ];

    for (const relativePath of coreFiles) {
      const source = await readFile(path.join(vendorRoot, relativePath), "utf8");
      expect(source.length, relativePath).toBeGreaterThan(0);
      expect(metadata.files?.some((file) => file.localPath === relativePath), relativePath).toBe(true);
    }
  });

  it("closes provenance across the complete Element inventory", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(vendorRoot, "upstream-elements.json"), "utf8"),
    ) as {
      revision?: string;
      owned?: string[];
      legacyExceptions?: string[];
    };
    const upstream = JSON.parse(
      await readFile(path.join(vendorRoot, "UPSTREAM.json"), "utf8"),
    ) as {
      revision?: string;
      files?: Array<{ localPath: string }>;
      patches?: unknown[];
    };
    const lock = JSON.parse(
      await readFile(path.join(vendorRoot, "assistant-ui-upstream.lock.json"), "utf8"),
    ) as {
      revision?: string;
      elements?: Record<string, string>;
    };
    const elementsRoot = path.join(vendorRoot, "components/assistant-ui/elements");
    const actual = (await readdir(elementsRoot))
      .map((file) => `components/assistant-ui/elements/${file}`)
      .sort();
    const provenanceElements = (upstream.files ?? [])
      .map((file) => file.localPath)
      .filter((file) => file.startsWith("components/assistant-ui/elements/"))
      .sort();

    expect(manifest.revision).toBe(upstream.revision);
    expect(lock.revision).toBe(upstream.revision);
    expect(manifest.owned?.sort()).toEqual(actual);
    expect(manifest.legacyExceptions).toEqual([]);
    expect(provenanceElements).toEqual(actual);
    expect(Object.keys(lock.elements ?? {}).sort()).toEqual(actual);
    expect(upstream.patches).toEqual([]);
  });
});
