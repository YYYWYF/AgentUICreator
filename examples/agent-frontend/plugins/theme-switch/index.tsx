import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "../../agent-ui/vendor/assistant-ui/components/ui/button";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";
import { usePluginService } from "../../runtime/plugins";
import {
  AGENT_UI_THEME_SERVICE,
  type AgentUIThemeService,
} from "../../services/agent-ui-theme";

import "./styles.css";

export function ThemeSwitchPlugin(_props: UIPluginComponentProps) {
  const instance = usePluginInstance();
  const theme = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);

  if (theme === undefined) {
    return null;
  }

  return <ThemeSwitch contextId={instance.id} theme={theme} />;
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
    </section>
  );
}
