import { readFile } from "node:fs/promises";
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
    expect(metadata.revision).toBe("6b29e7de829bef7e51297d3d66cd9e97175f3fc5");
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
    ];

    for (const relativePath of coreFiles) {
      const source = await readFile(path.join(vendorRoot, relativePath), "utf8");
      expect(source.length, relativePath).toBeGreaterThan(0);
      expect(metadata.files?.some((file) => file.localPath === relativePath), relativePath).toBe(true);
    }
  });
});
