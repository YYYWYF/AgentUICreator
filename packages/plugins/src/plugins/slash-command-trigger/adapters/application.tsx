import { usePluginService } from '@za38.03/agent-ui-plugins';
import { ConversationSlashCommandTrigger as Implementation } from '@za38.03/agent-ui-plugins/slash-command-trigger';
import type { ComponentProps } from 'react';
import { CONVERSATION_COMMAND_SOURCE, type ConversationCommandRegistry } from '@za38.03/agent-ui-plugins/composer-triggers';

export function ConversationSlashCommandTrigger(props: ComponentProps<typeof Implementation>) {
  const source = usePluginService<ConversationCommandRegistry>(CONVERSATION_COMMAND_SOURCE);
  // 在此传入 requestAdapter 定义选中数据；最终请求格式由 Composer 的 requestAdapter 决定。
  return <Implementation source={source} {...props} />;
}
