import { useId, type ComponentProps, type ReactNode } from 'react';
import { useLocaleSnapshot } from '../../../../plugin-support.js';
import { NativeSelect, NativeSelectOption, useLocale, type AgentUILocaleCode } from '../../../../public.js';
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

  disabled?: boolean;
  selectProps?: Omit<ComponentProps<typeof NativeSelect>, 'children' | 'value' | 'defaultValue' | 'disabled'>;
  options?: readonly AgentUILocaleCode[];
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderScopedSlot?: (name: string, scope: { kind: string; value: unknown }, fallback?: ReactNode) => ReactNode;
}

export function CanonicalLocaleSwitchPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  service,
  locale: controlledLocale,
  onLocaleChange,
  selectProps,
  disabled,
  options,
  ...rootProps
}: LocaleSwitchPluginProps) {
  const controlId = useId();
  const messages = useLocale('accessibility');
  const observedLocale = useLocaleSnapshot(controlledLocale === undefined ? service : undefined);
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
        id={controlId}
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
        {(options ?? (['zh-CN', 'en-US'] as const)).map((value) => (
          <NativeSelectOption key={value} value={value}>
            {{ 'zh-CN': messages.chineseName, 'en-US': messages.englishName }[value]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </section>
  );
}
