import { useSyncExternalStore } from "react";
import { LogOut, Moon, Sun } from "lucide-react";

import { Button } from "../../agent-ui/vendor/assistant-ui/components/ui/button";
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

export function ThemeSwitchPlugin(_props: UIPluginComponentProps) {
  const instance = usePluginInstance();
  const theme = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  const auth = usePluginService<AuthSessionService>(AUTH_SESSION_SERVICE);
  const authSnapshot = usePluginServiceSnapshot(auth, ANONYMOUS_SESSION);

  if (theme === undefined) {
    return null;
  }

  return <ThemeSwitch auth={auth} authSnapshot={authSnapshot} contextId={instance.id} theme={theme} />;
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
  const nextModeLabel = isDark ? "切换到浅色模式" : "切换到深色模式";

  return (
    <section
      aria-label="主题设置"
      className={[
        "theme-switch-plugin agent-ui-assistant-ui",
        isDark ? "dark" : undefined,
      ].filter(Boolean).join(" ")}
      data-theme={mode}
      data-theme-mode={mode}
      data-ui-plugin="theme-switch"
    >
      <Button
        aria-label={nextModeLabel}
        aria-pressed={isDark}
        className="theme-switch-plugin-control"
        id={`${contextId}-control`}
        onClick={() => theme.toggle()}
        title={nextModeLabel}
        type="button"
        variant="outline"
        size="icon"
      >
        {isDark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      </Button>
      {authSnapshot.authenticated ? (
        <Button
          aria-label="退出 Mock 登录"
          className="theme-switch-plugin-logout"
          onClick={() => auth?.logout()}
          title={`退出 ${authSnapshot.session?.displayName ?? "Demo User"}`}
          type="button"
          variant="ghost"
          size="icon-sm"
        >
          <LogOut aria-hidden="true" />
        </Button>
      ) : null}
    </section>
  );
}
