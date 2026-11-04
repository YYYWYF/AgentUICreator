import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { BotIcon as Bot } from '../../../../plugin-support.js';
import { useAgentUILocale, useAgentUILocaleCode } from '../../../../public.js';
export interface AgentIdentityPluginProps extends Omit<ComponentProps<'div'>, 'children'> {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderScopedSlot?: (name: string, scope: { kind: string; value: unknown }, fallback?: ReactNode) => ReactNode;
  name?: string | Partial<Record<'en-US' | 'zh-CN', string>>;
  logo?: string;
  description?: string;
  logoProps?: ComponentProps<'img'>;
  classNames?: Partial<Record<'name' | 'description', string>>;
  styles?: Partial<Record<'name' | 'description', CSSProperties>>;
  children?: ReactNode;
}
export function CanonicalAgentIdentityPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  name: configuredName,
  logo,
  description,
  logoProps,
  classNames,
  styles,
  children,
  ...rootProps
}: AgentIdentityPluginProps) {
  const messages = useAgentUILocale('agentIdentity');
  const locale = useAgentUILocaleCode();
  const name = typeof configuredName === 'string' ? configuredName : configuredName?.[locale] || messages.name;
  return (
    <div
      {...rootProps}
      className={['agent-identity-plugin', rootProps.className].filter(Boolean).join(' ')}
      role={rootProps.role ?? 'group'}
      aria-label={rootProps['aria-label'] ?? name}
      title={name}
      data-ui-plugin='agent-identity'
    >
      {children ?? (
        <>
          <div className='agent-identity-content'>
            <div className='agent-identity-logo'>
              {logo ? <img src={logo} alt='' {...logoProps} /> : <Bot aria-hidden='true' />}
            </div>
            <div className='agent-identity-heading'>
              <span
                className={['agent-identity-name', classNames?.name].filter(Boolean).join(' ')}
                style={styles?.name}
              >
                {name}
              </span>
              {description && (
                <span
                  className={['agent-identity-description', classNames?.description].filter(Boolean).join(' ')}
                  style={styles?.description}
                >
                  {description}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
