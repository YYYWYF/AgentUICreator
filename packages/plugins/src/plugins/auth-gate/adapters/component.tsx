import { CanonicalAuthGatePlugin, type AuthGatePluginProps } from '@za38.03/agent-ui-plugins';
import './styles.css';
export function AuthGatePlugin(props: AuthGatePluginProps) {
  return <CanonicalAuthGatePlugin {...props} />;
}

export type { AuthSessionService, AuthSessionSnapshot } from './adapters/auth-contract';
