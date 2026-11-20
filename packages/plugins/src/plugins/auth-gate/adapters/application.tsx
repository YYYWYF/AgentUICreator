import { AuthGatePlugin as Implementation } from '@za38.03/agent-ui-plugins/auth-gate';
import type { ComponentProps } from 'react';
import { useAuthSession } from '../../services/hooks/useAuthSession';

export function AuthGatePlugin(props: ComponentProps<typeof Implementation>) {
  const { session } = useAuthSession();
  const snapshot = useAuthSession(state => state);
  return <Implementation session={session} state={snapshot} {...props} />;
}
