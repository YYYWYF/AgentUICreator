import { generatedProjectFixture } from "../../../project-control/tests/support/generated-project";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import appUIJson from "../../../project-control/tests/fixtures/project/app-ui/app-ui.json";
import { parseAppUIModel } from "../../../project-control/src/framework/contracts/app-ui-model";
import { collectAppUIPluginLocations } from "../../../project-control/src/framework/contracts/app-ui-model";

describe("theme plugin boundary", () => {
  it("keeps public component implementation dependencies out of the picker item", async () => {
    const item = JSON.parse(await readFile(new URL(
      "../../../source-registry/registry/items/plugin-theme-switch/item.json", import.meta.url,
    ), "utf8")) as { packages: Record<string, string> };
    expect(item.packages).toHaveProperty("react");
    expect(item.packages).not.toHaveProperty("lucide-react");
  });
  it("keeps the provider headless and the switch independent from Ant Design", async () => {
    const [providerDefinition, providerComponent, providerManifest, switchDefinition, switchComponent, switchManifest, registry] = await Promise.all([
      readFile(new URL("plugins/theme-provider/definition.ts", `file://${await generatedProjectFixture()}/`), "utf8"),
      readFile(new URL("plugins/theme-provider/index.tsx", `file://${await generatedProjectFixture()}/`), "utf8"),
      readFile(new URL("plugins/theme-provider/manifest.json", `file://${await generatedProjectFixture()}/`), "utf8"),
      readFile(new URL("plugins/theme-switch/definition.ts", `file://${await generatedProjectFixture()}/`), "utf8"),
      readFile(new URL("plugins/theme-switch/index.tsx", `file://${await generatedProjectFixture()}/`), "utf8"),
      readFile(new URL("plugins/theme-switch/manifest.json", `file://${await generatedProjectFixture()}/`), "utf8"),
      readFile(new URL("plugins/registry.generated.ts", `file://${await generatedProjectFixture()}/`), "utf8"),
    ]);
    const provider = JSON.parse(providerManifest) as {
      id?: string;
      capabilities?: string[];
      description?: string;
      authoring?: { intents: string[] };
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
    expect(provider.description).toContain("theme preset");
    expect(provider.authoring?.intents.join(" ")).toMatch(/light, dark, and violet theme preset/u);
    expect(providerDefinition).toContain("provides: [AGENT_UI_THEME_SERVICE]");
    expect(providerDefinition).toContain("agentUIThemeConfig.theme");
    expect(providerDefinition).not.toContain("updateInstanceProps");
    expect(providerComponent).toMatch(/ThemeProviderPlugin\(\)\s*\{\s*return null;/u);

    expect(themeSwitch).toMatchObject({ id: "theme-switch" });
    expect(switchDefinition).toContain("inject: [AGENT_UI_THEME_SERVICE]");
    expect(switchSource).toContain('from "@agent-ui/react"');
    expect(switchSource).toContain("<NativeSelect");
    expect(switchSource).toContain("service.setTheme(nextTheme)");
    expect(switchSource).not.toContain("toggle()");
    expect(switchSource).toContain("value={theme}");
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
