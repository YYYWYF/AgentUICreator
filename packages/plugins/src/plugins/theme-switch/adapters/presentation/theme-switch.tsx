import type { ComponentProps, ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { AGENT_UI_THEME_PRESETS, getAgentUIThemeColorScheme, isAgentUITheme, NativeSelect, NativeSelectOption, useAgentUILocale, type AgentUITheme } from "../../../../public.js";
export interface ThemeSwitchPluginProps { renderSlot?: (name:string,fallback?:ReactNode)=>ReactNode; contextId?: string; service?: {getTheme():AgentUITheme;setTheme(theme:AgentUITheme):void;subscribe(listener:()=>void):()=>void} | undefined; rootProps?:ComponentProps<"section">; selectProps?:ComponentProps<typeof NativeSelect>; children?:ReactNode; }
export function CanonicalThemeSwitchPlugin({ contextId = "theme", service, rootProps, selectProps, children }: ThemeSwitchPluginProps) {
  const locale = useAgentUILocale("theme");
  const theme = useSyncExternalStore(service?.subscribe ?? (() => () => {}), service?.getTheme ?? (() => "light" as const), service?.getTheme ?? (() => "light" as const));
  if (!service) return null;
  const colorScheme = getAgentUIThemeColorScheme(theme);
  return (
    <section
      {...rootProps}
      aria-label={rootProps?.["aria-label"] ?? locale.settings}
      className={[
        "theme-switch-plugin agent-ui-conversation",
        colorScheme === "dark" ? "dark" : undefined,
        rootProps?.className,
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
        {...selectProps}
        onChange={(event) => {
          selectProps?.onChange?.(event); if(event.defaultPrevented)return;
          const nextTheme = event.currentTarget.value;
          if (isAgentUITheme(nextTheme)) service.setTheme(nextTheme);
        }}
      >
        {children ?? Object.keys(AGENT_UI_THEME_PRESETS).filter(isAgentUITheme).map((preset) => (
          <NativeSelectOption key={preset} value={preset}>{locale[preset]}</NativeSelectOption>
        ))}
      </NativeSelect>
    </section>
  );
}
