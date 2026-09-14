import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const packageStylesUrl = new URL(
  "../../../packages/react/src/styles.css",
  import.meta.url,
);
const projectStylesUrl = new URL(
  "../agent-ui/conversation/styles.css",
  import.meta.url,
);

describe("assistant-ui scoped Tailwind source coverage", () => {
  it("registers each intended utility consumer without broadening the boundary", async () => {
    const [packageStyles, projectStyles] = await Promise.all([
      readFile(packageStylesUrl, "utf8"),
      readFile(projectStylesUrl, "utf8"),
    ]);

    expect(packageStyles).toContain(
      '@import "tailwindcss/utilities.css" layer(utilities) source("./internal/vendor/assistant-ui");',
    );
    expect(projectStyles).toContain('@import "@agent-ui/react/styles.css";');
    expect(projectStyles).toContain('@source ".";');
    expect(projectStyles).toContain('@source "../../plugins";');
  });
});
