import { LogoutOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Button, Switch, Tooltip } from "antd";
import { useSyncExternalStore } from "react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";
import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../runtime/plugins";
import {
  AGENT_UI_THEME_SERVICE,
  type AgentUIThemeService,
} from "../../services/agent-ui-theme";
import {
  AUTH_SESSION_SERVICE,
  type AuthSessionService,
  type AuthSessionSnapshot,
} from "../../services/auth-session";

import "./styles.css";

const ANONYMOUS_SESSION: AuthSessionSnapshot = { authenticated: false };

export function AntdXThemeSwitchPlugin(_props: UIPluginComponentProps) {
  const instance = usePluginInstance();
  const theme = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  const auth = usePluginService<AuthSessionService>(AUTH_SESSION_SERVICE);
  const authSnapshot = usePluginServiceSnapshot(auth, ANONYMOUS_SESSION);

  if (theme === undefined) {
    return null;
  }

  return (
    <ThemeSwitch
      auth={auth}
      authSnapshot={authSnapshot}
      contextId={instance.id}
      theme={theme}
    />
  );
}

function ThemeSwitch({
  auth,
  authSnapshot,
  contextId,
  theme,
}: {
  auth: AuthSessionService | undefined;
  authSnapshot: AuthSessionSnapshot;
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
      {authSnapshot.authenticated ? (
        <Tooltip
          title={`退出 ${authSnapshot.session?.displayName ?? "Demo User"}`}
        >
          <Button
            aria-label="退出 Mock 登录"
            className="antd-x-theme-switch-plugin-logout"
            icon={<LogoutOutlined />}
            onClick={() => auth?.logout()}
            shape="circle"
            size="small"
            type="text"
          />
        </Tooltip>
      ) : null}
    </section>
  );
}
