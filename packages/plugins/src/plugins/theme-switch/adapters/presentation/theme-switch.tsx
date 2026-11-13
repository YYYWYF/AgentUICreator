import type { ComponentProps, ReactNode } from 'react';
import { useAgentUIThemeSnapshot } from '../../../../plugin-support.js';
import {
  AGENT_UI_THEME_PRESETS,
  getAgentUIThemeColorScheme,
  isAgentUITheme,
  NativeSelect,
  NativeSelectOption,
  useAgentUILocale,
  type AgentUITheme,
} from '../../../../public.js';
export interface ThemeSwitchPluginProps extends Omit<ComponentProps<'section'>, 'children'> {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderScopedSlot?: (name: string, scope: { kind: string; value: unknown }, fallback?: ReactNode) => ReactNode;
  contextId?: string;
  service?:
    | { getTheme(): string; setTheme(theme: AgentUITheme): void; subscribe(listener: () => void): () => void }
    | undefined;
  theme?: AgentUITheme | undefined;
  onThemeChange?: ((theme: AgentUITheme) => void) | undefined;
  disabled?: boolean;
  selectProps?: ComponentProps<typeof NativeSelect>;
  children?: ReactNode;
}
export function CanonicalThemeSwitchPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  contextId = 'theme',
  service,
  theme: controlledTheme,
  onThemeChange,
  selectProps,
  disabled,
  children,
  ...rootProps
}: ThemeSwitchPluginProps) {
  const locale = useAgentUILocale('theme');
  const observedTheme = useAgentUIThemeSnapshot(controlledTheme === undefined ? service : undefined);
  const theme = controlledTheme ?? observedTheme;
  const changeTheme = onThemeChange ?? (service ? (next: AgentUITheme) => service.setTheme(next) : undefined);
  if (!changeTheme) {
    return null;
  }
  const colorScheme = getAgentUIThemeColorScheme(theme);
  return (
    <section
      {...rootProps}
      aria-label={rootProps?.['aria-label'] ?? locale.settings}
      className={[
        'theme-switch-plugin agent-ui-conversation',
        colorScheme === 'dark' ? 'dark' : undefined,
        rootProps?.className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-theme={theme}
      data-color-scheme={colorScheme}
      data-ui-plugin='theme-switch'
    >
      <NativeSelect
        disabled={disabled}
        aria-label={locale.settings}
        className='theme-switch-plugin-control'
        id={`${contextId}-control`}
        value={theme}
        {...selectProps}
        onChange={(event) => {
          selectProps?.onChange?.(event);
          if (event.defaultPrevented) {
            return;
          }
          const nextTheme = event.currentTarget.value;
          if (isAgentUITheme(nextTheme)) {
            changeTheme(nextTheme);
          }
        }}
      >
        {children ??
          Object.keys(AGENT_UI_THEME_PRESETS)
            .filter(isAgentUITheme)
            .map((preset) => (
              <NativeSelectOption key={preset} value={preset}>
                {locale[preset]}
              </NativeSelectOption>
            ))}
      </NativeSelect>
    </section>
  );
}
