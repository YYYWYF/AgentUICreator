import { AuthAccountPlugin as Implementation } from '@za38.03/agent-ui-plugins/auth-account';
import { useHostUser } from '@za38.03/agent-ui-runtime/ui/application/host-user';
import type { ComponentProps } from 'react';
import { useAuthSession } from '../../services/hooks/useAuthSession';

export function AuthAccountPlugin(props: ComponentProps<typeof Implementation>) {
  const hostUser = useHostUser();
  const { session, snapshot } = useAuthSession();
  return <Implementation hostUser={hostUser} session={session} snapshot={snapshot} {...props} />;
}
