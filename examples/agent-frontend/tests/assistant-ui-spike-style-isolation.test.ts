import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const globalsUrl = new URL(
  "../src/spikes/assistant-ui/styles/globals.css",
  import.meta.url,
);
const scopedPreflightUrl = new URL(
  "../src/spikes/assistant-ui/styles/preflight.scoped.css",
  import.meta.url,
);

describe("assistant-ui Spike style isolation", () => {
  it("loads explicit Tailwind layers without global Preflight", async () => {
    const globals = await readFile(globalsUrl, "utf8");

    expect(globals).toContain(
      '@import "tailwindcss/theme.css" layer(theme);',
    );
    expect(globals).toContain(
      '@import "./preflight.scoped.css" layer(base);',
    );
    expect(globals).toContain(
      '@import "tailwindcss/utilities.css" layer(utilities);',
    );
    expect(globals).not.toMatch(/@import\s+["']tailwindcss["']/u);
    expect(globals).not.toMatch(
      /@import\s+["']tailwindcss\/preflight\.css["']/u,
    );
  });

  it("keeps every high-risk reset selector under the Spike root", async () => {
    const preflight = await readFile(scopedPreflightUrl, "utf8");
    const css = preflight.replace(/\/\*[\s\S]*?\*\//gu, "");
    const bareElementSelector =
      /(?:^|,)\s*(?:html|body|button|input|textarea|select|ol|ul)(?=\s|,|:|\[|\{)/gmu;
    const bareUniversalSelector = /(?:^|,)\s*\*(?=\s|,|:|\{)/gmu;

    expect(css).not.toMatch(bareElementSelector);
    expect(css).not.toMatch(bareUniversalSelector);
    expect(css).not.toMatch(/(?:^|,)\s*::(?:before|after|backdrop|file-selector-button)/gmu);
  });

  it("keeps the form-control reset gate scoped", async () => {
    const preflight = await readFile(scopedPreflightUrl, "utf8");

    for (const control of ["button", "input", "textarea", "select"]) {
      expect(preflight).toContain(`.assistant-ui-spike ${control}`);
    }
    expect(preflight).toContain(".assistant-ui-spike ::file-selector-button");
    expect(preflight).toContain("font: inherit;");
    expect(preflight).toContain("background-color: transparent;");
    expect(preflight).toContain("appearance: button;");
    expect(preflight).toContain("resize: vertical;");
  });
});
