import { CanonicalAuthAccountPlugin, type AuthAccountPluginProps } from '@za38.03/agent-ui-plugins';
import './styles.css';
export function AuthAccountPlugin(props: AuthAccountPluginProps) {
  return <CanonicalAuthAccountPlugin {...props} />;
}
