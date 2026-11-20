import { CanonicalAuthAccountPlugin as Implementation } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import { useHostUser } from '@za38.03/agent-ui-runtime/ui/application/host-user';
import type { ComponentProps } from 'react';
import { useAuthSession } from '../../services/hooks/useAuthSession';
import './styles.css';

export function AccountView({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const hostUser = useHostUser();
  const { session } = useAuthSession();
  const user = useAuthSession(state => state.user);
  const busy = useAuthSession(state => state.busy);
  const snapshot = { user, busy };
  return <Implementation hostUser={hostUser} session={session} snapshot={snapshot} {...props} />;
}
