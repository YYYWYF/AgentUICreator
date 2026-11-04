import { type UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation, { createAuthSession } from '@za38.03/agent-ui-plugins/auth-gate';
import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { AUTH_GATE_SERVICE, AUTH_SESSION_SERVICE } from '../../services/auth/session';
import { createHostAuthAdapter } from './host-auth-adapter';
import { AuthGatePlugin } from './index';

export const authGatePlugin: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [AUTH_GATE_SERVICE, AUTH_SESSION_SERVICE],
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  setup: implementation.bindSetup(({ services }: Parameters<NonNullable<UIPluginDefinition['setup']>>[0]) => {
    const session = createAuthSession(createHostAuthAdapter());
    services.provide(AUTH_GATE_SERVICE, session.gate);
    services.provide(AUTH_SESSION_SERVICE, session);
    session.restore();
    return () => session.dispose();
  }),
  Component: AuthGatePlugin,
};
export default authGatePlugin;
