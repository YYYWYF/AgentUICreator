import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Switch, Tooltip } from "antd";
import { useSyncExternalStore } from "react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {
  AGENT_UI_THEME_SERVICE,
  type AgentUIThemeService,
} from "../antd-x-theme-provider/theme-service";

import "./styles.css";

export function AntdXThemeSwitchPlugin({ context }: UIPluginComponentProps) {
  const theme = context.services.get(AGENT_UI_THEME_SERVICE);

  if (theme === undefined) {
    return null;
  }

  return <ThemeSwitch contextId={context.instance.id} theme={theme} />;
}

function ThemeSwitch({
  contextId,
  theme,
}: {
  contextId: string;
  theme: AgentUIThemeService;
}) {
  const mode = useSyncExternalStore(
    theme.subscribe,
    theme.getMode,
    theme.getMode,
  );
  const isDark = mode === "dark";

  return (
    <section
      className="antd-x-theme-switch-plugin"
      data-theme-mode={mode}
      data-ui-plugin="antd-x-theme-switch"
    >
      <div className="antd-x-theme-switch-plugin-copy">
        <span className="antd-x-theme-switch-plugin-eyebrow">Interface</span>
        <strong>{isDark ? "深色模式" : "浅色模式"}</strong>
      </div>
      <Tooltip title={isDark ? "切换到浅色模式" : "切换到深色模式"}>
        <Switch
          aria-label="切换深色和浅色主题"
          checked={isDark}
          checkedChildren={<MoonOutlined />}
          className="antd-x-theme-switch-plugin-control"
          id={`${contextId}-control`}
          onChange={(checked: boolean) =>
            theme.setMode(checked ? "dark" : "light")
          }
          unCheckedChildren={<SunOutlined />}
        />
      </Tooltip>
    </section>
  );
}
