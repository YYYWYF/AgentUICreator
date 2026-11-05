import { AgentIdentityPlugin as Implementation } from '@za38.03/agent-ui-plugins/agent-identity';
import type { ComponentProps } from 'react';

/** Agent 身份头像图片地址（项目自有配置点，可随时替换）。 */
const AGENT_LOGO_URL = 'http://127.0.0.1:47835/avatar.svg';

export function AgentIdentityPlugin({ logo, ...props }: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} logo={logo ?? AGENT_LOGO_URL} />;
}
