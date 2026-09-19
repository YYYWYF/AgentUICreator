import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import { collectAppUIPluginLocations } from "../framework/contracts/app-ui-model";

describe("theme plugin boundary", () => {
  it("keeps the provider headless and the switch independent from Ant Design", async () => {
    const [providerDefinition, providerComponent, providerManifest, switchDefinition, switchComponent, switchManifest, registry] = await Promise.all([
      readFile(new URL("../plugins/theme-provider/definition.ts", import.meta.url), "utf8"),
      readFile(new URL("../plugins/theme-provider/index.tsx", import.meta.url), "utf8"),
      readFile(new URL("../plugins/theme-provider/manifest.json", import.meta.url), "utf8"),
      readFile(new URL("../plugins/theme-switch/definition.ts", import.meta.url), "utf8"),
      readFile(new URL("../plugins/theme-switch/index.tsx", import.meta.url), "utf8"),
      readFile(new URL("../plugins/theme-switch/manifest.json", import.meta.url), "utf8"),
      readFile(new URL("../plugins/registry.generated.ts", import.meta.url), "utf8"),
    ]);
    const provider = JSON.parse(providerManifest) as {
      id?: string;
      capabilities?: string[];
    };
    const themeSwitch = JSON.parse(switchManifest) as { id?: string };
    const switchSource = `${switchDefinition}\n${switchComponent}`;
    const model = parseAppUIModel(appUIJson);
    const plugins = new Map(
      collectAppUIPluginLocations(model).map(({ plugin, target }) => [plugin.id, { plugin, target }]),
    );

    expect(provider).toMatchObject({
      id: "theme-provider",
      capabilities: expect.arrayContaining(["plugin-service-provider", "theme", "headless"]),
    });
    expect(providerDefinition).toContain("provides: [AGENT_UI_THEME_SERVICE]");
    expect(providerDefinition).toContain("agentUIThemeConfig.defaultMode");
    expect(providerDefinition).not.toContain("updateInstanceProps");
    expect(providerComponent).toMatch(/ThemeProviderPlugin\(\)\s*\{\s*return null;/u);

    expect(themeSwitch).toMatchObject({ id: "theme-switch" });
    expect(switchDefinition).toContain("inject: [AGENT_UI_THEME_SERVICE]");
    expect(switchSource).toContain("components/ui/button");
    expect(switchSource).toContain('from "lucide-react"');
    expect(switchSource).toContain("theme.toggle()");
    expect(switchSource).toContain("aria-pressed");
    expect(switchSource).not.toMatch(/@ant-design\/icons|from\s+["']antd["']/u);
    expect(switchSource).not.toContain("ant-switch");
    expect(switchSource).not.toContain("ant-btn");

    expect(plugins.get("theme-provider-main")).toMatchObject({
      plugin: { pluginId: "theme-provider", enabled: true },
      target: { type: "application" },
    });
    expect(plugins.get("theme-provider-main")?.plugin).not.toHaveProperty("props");
    expect(plugins.has("theme-switch-main")).toBe(false);
    expect(JSON.stringify(model.root)).not.toContain("theme-control");
    expect(JSON.stringify(model.root)).not.toContain("workspace.inspector");
    expect(JSON.stringify(model.root)).not.toContain("workspace-shell");

    expect(registry).toContain('./theme-provider/definition');
    expect(registry).toContain('./theme-switch/definition');
    expect(registry).not.toMatch(/import pluginDefinition/u);

  });
});
