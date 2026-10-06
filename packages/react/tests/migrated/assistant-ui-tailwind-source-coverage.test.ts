import { generatedProjectFixture } from "../../../project-control/tests/support/generated-project";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const packageStylesUrl = new URL("../../../../packages/react/src/styles.css", import.meta.url);
const projectStylesUrl = new URL("agent-ui/conversation/styles.css", `file://${await generatedProjectFixture()}/`);

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

it("compiles adapter-only utilities into the independently generated project stylesheet", async () => {
  const { createServer } = await import("vite");
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  const root = await generatedProjectFixture();
  const server = await createServer({ configFile: false, logLevel: "silent", root,
    plugins: [tailwindcss()], server: { middlewareMode: true, hmr: false } });
  try {
    const result = await server.transformRequest("/agent-ui/conversation/styles.css?direct");
    const css = result?.code ?? "";
    for (const selector of [".mb-0", ".row-start-3", ".self-start", ".bg-foreground\\/10", ".focus-within\\:border-border"]) expect(css).toContain(selector);
    expect(css).toContain("grid-row-start: 3");
    expect(css).toContain("align-self: flex-start");
    expect(css).toContain("scrollbar-width: none");
  } finally { await server.close(); }
});
