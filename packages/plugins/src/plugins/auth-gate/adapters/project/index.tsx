import { CanonicalAuthGatePlugin as Implementation } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import type { ComponentProps } from 'react';
import { useAuthSession } from '../../services/hooks/useAuthSession';
import './styles.css';

export function LoginScreen({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const { session, snapshot: state } = useAuthSession();
  return <Implementation session={session} state={state} {...props} />;
}
