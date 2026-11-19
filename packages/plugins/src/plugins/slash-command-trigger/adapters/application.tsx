import { usePluginService } from '@za38.03/agent-ui-plugins';
import { ConversationSlashCommandTrigger as Implementation } from '@za38.03/agent-ui-plugins/slash-command-trigger';
import type { ComponentProps } from 'react';
import { CONVERSATION_COMMAND_SOURCE, type ConversationCommandRegistry } from '@za38.03/agent-ui-plugins/composer-triggers';

export function ConversationSlashCommandTrigger(props: ComponentProps<typeof Implementation>) {
  const source = usePluginService<ConversationCommandRegistry>(CONVERSATION_COMMAND_SOURCE);
  // 命令的业务数据在 source 中定义；Composer 的 requestAdapter 统一组装选中项数据。
  return <Implementation source={source} {...props} />;
}
