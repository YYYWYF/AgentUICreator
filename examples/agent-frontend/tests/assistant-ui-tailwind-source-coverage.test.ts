import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const globalsUrl = new URL(
  "../agent-ui/conversation/styles/globals.css",
  import.meta.url,
);

describe("assistant-ui scoped Tailwind source coverage", () => {
  it("registers each intended utility consumer without broadening the boundary", async () => {
    const globals = await readFile(globalsUrl, "utf8");

    expect(globals).toContain(
      '@import "tailwindcss/utilities.css" layer(utilities) source("../../../vendor/assistant-ui");',
    );
    expect(globals).toContain('@source "..";');
    expect(globals).toContain(
      '@source "../../../../plugins/conversation-thread-list";',
    );
    expect(globals).not.toContain('@source "../../../../plugins";');
    expect(globals).not.toContain(
      '@source "../../../../plugins/conversation-suggestions";',
    );
  });
});
