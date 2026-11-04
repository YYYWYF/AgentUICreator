import { type ComponentProps, type ReactNode, useState } from 'react';

import { Button, Input, useAgentUILocale } from '../../../../public.js';
import type { AuthSessionSnapshot } from './auth-contract.js';
export interface AuthGatePluginProps extends Omit<ComponentProps<'div'>, 'children' | 'title'> {
  title?: ReactNode;
  submitText?: ReactNode;
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
  renderScopedSlot?: (name: string, scope: { kind: string; value: unknown }, fallback?: ReactNode) => ReactNode;
  session?: { signIn(input: { account: string; password: string }): Promise<void> } | undefined;
  state?: AuthSessionSnapshot;
  formProps?: ComponentProps<'form'>;
  accountInputProps?: ComponentProps<typeof Input>;
  passwordInputProps?: ComponentProps<typeof Input>;
  submitButtonProps?: ComponentProps<typeof Button>;
}
export function CanonicalAuthGatePlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  title,
  submitText,
  session,
  state = { status: 'checking', user: null, busy: false, error: null },
  formProps,
  accountInputProps,
  passwordInputProps,
  submitButtonProps,
  ...rootProps
}: AuthGatePluginProps) {
  const messages = useAgentUILocale('auth');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  if (state.status === 'checking') {
    return (
      <div {...rootProps} className={['auth-gate-plugin', rootProps.className].filter(Boolean).join(' ')} role='status'>
        {messages.checking}
      </div>
    );
  }
  return (
    <div {...rootProps} className={['auth-gate-plugin', rootProps.className].filter(Boolean).join(' ')}>
      <form
        className='auth-gate-form'
        {...formProps}
        onSubmit={(event) => {
          formProps?.onSubmit?.(event);
          if (event.defaultPrevented) {
            return;
          }
          event.preventDefault();
          const credentials = { account, password };
          setPassword('');
          void session?.signIn(credentials);
        }}
        aria-busy={state.busy}
      >
        <h1>{title ?? messages.title}</h1>
        <label>
          {messages.account}
          <Input
            name='username'
            autoComplete='username'
            required
            value={account}
            disabled={state.busy}
            {...accountInputProps}
            onChange={(event) => {
              accountInputProps?.onChange?.(event);
              setAccount(event.target.value);
            }}
          />
        </label>
        <label>
          {messages.password}
          <Input
            name='password'
            type='password'
            autoComplete='current-password'
            required
            value={password}
            disabled={state.busy}
            {...passwordInputProps}
            onChange={(event) => {
              passwordInputProps?.onChange?.(event);
              setPassword(event.target.value);
            }}
          />
        </label>
        {state.error && (
          <p role='alert'>{state.error === 'sign-in-failed' ? messages.signInFailed : messages.signOutFailed}</p>
        )}
        <Button type='submit' disabled={state.busy || !session} {...submitButtonProps}>
          {submitText ?? submitButtonProps?.children ?? (state.busy ? messages.working : messages.signIn)}
        </Button>
      </form>
    </div>
  );
}
