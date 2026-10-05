import { useSyncExternalStore } from "react";
import {
  AGENT_UI_THEME_PRESETS,
  getAgentUIThemeColorScheme,
  isAgentUITheme,
  NativeSelect,
  NativeSelectOption,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
import { usePluginInstance } from "../../runtime/context";
import { usePluginService } from "../../runtime/plugins";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "../../services/agent-ui-theme";
import "./styles.css";

export function ThemeSwitchPlugin(_props: UIPluginComponentProps) {
  const instance = usePluginInstance();
  const theme = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  if (theme === undefined) return null;
  return <ThemePicker contextId={instance.id} service={theme} />;
}

function ThemePicker({ contextId, service }: { contextId: string; service: AgentUIThemeService }) {
  const locale = useAgentUILocale("theme");
  const theme = useSyncExternalStore(service.subscribe, service.getTheme, service.getTheme);
  const colorScheme = getAgentUIThemeColorScheme(theme);
  return (
    <section
      aria-label={locale.settings}
      className={[
        "theme-switch-plugin agent-ui-conversation",
        colorScheme === "dark" ? "dark" : undefined,
      ].filter(Boolean).join(" ")}
      data-theme={theme}
      data-color-scheme={colorScheme}
      data-ui-plugin="theme-switch"
    >
      <NativeSelect
        aria-label={locale.settings}
        className="theme-switch-plugin-control"
        id={`${contextId}-control`}
        value={theme}
        onChange={(event) => {
          const nextTheme = event.currentTarget.value;
          if (isAgentUITheme(nextTheme)) service.setTheme(nextTheme);
        }}
      >
        {Object.keys(AGENT_UI_THEME_PRESETS).filter(isAgentUITheme).map((preset) => (
          <NativeSelectOption key={preset} value={preset}>{locale[preset]}</NativeSelectOption>
        ))}
      </NativeSelect>
    </section>
  );
}
