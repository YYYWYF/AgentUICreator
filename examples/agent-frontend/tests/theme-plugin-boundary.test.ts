import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";

const legacyThemeProviderId = ["antd", "x", "theme", "provider"].join("-");
const legacyThemeSwitchId = ["antd", "x", "theme", "switch"].join("-");

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

    expect(provider).toMatchObject({
      id: "theme-provider",
      capabilities: expect.arrayContaining(["plugin-service-provider", "theme", "headless"]),
    });
    expect(providerDefinition).toContain("provides: [AGENT_UI_THEME_SERVICE]");
    expect(providerDefinition).toContain("readAgentUIThemeMode");
    expect(providerDefinition).toContain("updateInstanceProps({ mode })");
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

    expect(model.pluginInstances["theme-provider-main"]).toMatchObject({
      pluginId: "theme-provider",
      enabled: true,
      props: { mode: "light" },
    });
    expect(model.pluginInstances["theme-provider-main"]?.mount).toBeUndefined();
    expect(JSON.stringify(model.root)).not.toContain("theme-switch");
    expect(JSON.stringify(model.root)).not.toContain("workspace.inspector");
    expect(JSON.stringify(model.root)).not.toContain("workspace-shell");

    expect(registry).toContain('./theme-provider/definition');
    expect(registry).not.toContain('./theme-switch/definition');

    const projectSource = [
      providerDefinition,
      providerComponent,
      providerManifest,
      switchDefinition,
      switchComponent,
      switchManifest,
      registry,
    ].join("\n");
    expect(projectSource).not.toContain(legacyThemeProviderId);
    expect(projectSource).not.toContain(legacyThemeSwitchId);
  });
});
