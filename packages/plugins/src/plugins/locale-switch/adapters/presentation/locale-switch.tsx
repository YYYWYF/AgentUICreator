import type { ComponentProps, ReactNode } from 'react';
import { useAgentUILocaleSnapshot } from '../../../../plugin-support.js';
import { NativeSelect, NativeSelectOption, useAgentUILocale, type AgentUILocaleCode } from '../../../../public.js';
// The application supplies its existing locale service; no private context is created.
interface AgentUILocaleService {
  getSnapshot(): { locale: AgentUILocaleCode };
  subscribe(listener: () => void): () => void;
  setLocale(locale: AgentUILocaleCode): void;
}

export interface LocaleSwitchPluginProps extends Omit<ComponentProps<'section'>, 'children'> {
  service?: AgentUILocaleService | undefined;
  locale?: AgentUILocaleCode | undefined;
  onLocaleChange?: ((locale: AgentUILocaleCode) => void) | undefined;
  contextId?: string;

  disabled?: boolean;
  selectProps?: ComponentProps<typeof NativeSelect>;
  children?: ReactNode;
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderScopedSlot?: (name: string, scope: { kind: string; value: unknown }, fallback?: ReactNode) => ReactNode;
}

export function CanonicalLocaleSwitchPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  service,
  locale: controlledLocale,
  onLocaleChange,
  contextId = 'locale',
  selectProps,
  disabled,
  children,
  ...rootProps
}: LocaleSwitchPluginProps) {
  const messages = useAgentUILocale('accessibility');
  const observedLocale = useAgentUILocaleSnapshot(controlledLocale === undefined ? service : undefined);
  const locale = controlledLocale ?? observedLocale;
  const changeLocale = onLocaleChange ?? (service ? (next: AgentUILocaleCode) => service.setLocale(next) : undefined);
  if (!changeLocale) {
    return null;
  }
  return (
    <section
      {...rootProps}
      className={['locale-switch-plugin', rootProps?.className].filter(Boolean).join(' ')}
      aria-label={rootProps?.['aria-label'] ?? messages.language}
      data-ui-plugin='locale-switch'
    >
      <NativeSelect
        disabled={disabled}
        id={`${contextId}-control`}
        aria-label={messages.language}
        className='locale-switch-plugin-control'
        value={locale}
        {...selectProps}
        onChange={(event) => {
          selectProps?.onChange?.(event);
          if (event.defaultPrevented) {
            return;
          }
          const nextLocale = event.currentTarget.value;
          if (nextLocale === 'zh-CN' || nextLocale === 'en-US') {
            changeLocale(nextLocale as AgentUILocaleCode);
          }
        }}
      >
        {children ?? (
          <>
            <NativeSelectOption value='zh-CN'>{messages.chineseName}</NativeSelectOption>
            <NativeSelectOption value='en-US'>{messages.englishName}</NativeSelectOption>
          </>
        )}
      </NativeSelect>
    </section>
  );
}
