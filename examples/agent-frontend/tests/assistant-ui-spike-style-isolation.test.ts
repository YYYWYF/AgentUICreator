import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { describe, expect, it } from "vitest";
import { createServer, resolveConfig } from "vite";

const globalsUrl = new URL(
  "../agent-ui/adapters/assistant-ui/styles/globals.css",
  import.meta.url,
);
const scopedPreflightUrl = new URL(
  "../agent-ui/adapters/assistant-ui/styles/preflight.scoped.css",
  import.meta.url,
);
const workbenchViteConfigUrl = new URL(
  "../../../apps/creator-workbench/vite.config.ts",
  import.meta.url,
);
const frontendViteConfigUrl = new URL("../vite.config.ts", import.meta.url);
const frontendRoot = fileURLToPath(new URL("..", import.meta.url));

describe("formal assistant-ui adapter style isolation", () => {
  it("loads explicit Tailwind layers without global Preflight", async () => {
    const globals = await readFile(globalsUrl, "utf8");

    expect(globals).toContain(
      '@import "tailwindcss/theme.css" layer(theme);',
    );
    expect(globals).toContain(
      '@import "./preflight.scoped.css" layer(base);',
    );
    expect(globals).toContain(
      '@import "tailwindcss/utilities.css" layer(utilities) source("../../../vendor/assistant-ui");',
    );
    expect(globals).not.toMatch(/@import\s+["']tailwindcss["']/u);
    expect(globals).not.toMatch(
      /@import\s+["']tailwindcss\/preflight\.css["']/u,
    );
  });

  it("generates formal vendor utilities in both Vite hosts", async () => {
    for (const configUrl of [frontendViteConfigUrl, workbenchViteConfigUrl]) {
      const config = await resolveConfig(
        {
          configFile: fileURLToPath(configUrl),
          logLevel: "silent",
        },
        "serve",
      );
      expect(config.plugins.map((plugin) => plugin.name)).toContain(
        "@tailwindcss/vite:generate:serve",
      );
    }

    const server = await createServer({
      configFile: false,
      logLevel: "silent",
      plugins: [tailwindcss()],
      root: frontendRoot,
      server: {
        hmr: false,
        middlewareMode: true,
      },
    });

    try {
      const result = await server.transformRequest(
        "/agent-ui/adapters/assistant-ui/styles/globals.css?direct",
      );

      expect(result?.code).toContain(".sr-only");
      expect(result?.code).toContain(".inline-flex");
      expect(result?.code).not.toContain("@tailwind utilities");
    } finally {
      await server.close();
    }
  });

  it("keeps every high-risk reset selector under the formal root", async () => {
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
      expect(preflight).toContain(`.agent-ui-assistant-ui ${control}`);
    }
    expect(preflight).toContain(".agent-ui-assistant-ui ::file-selector-button");
    expect(preflight).toContain("font: inherit;");
    expect(preflight).toContain("background-color: transparent;");
    expect(preflight).toContain("appearance: button;");
    expect(preflight).toContain("resize: vertical;");
  });
});
