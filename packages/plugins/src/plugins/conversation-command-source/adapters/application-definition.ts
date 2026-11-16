import {
  resolveAgentUILocaleMessages,
  type AgentUILocaleCode,
  type ConversationSlashCommand,
  type UIPluginDefinition,
} from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/conversation-command-source';
import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { CONVERSATION_COMMAND_SOURCE, createConversationCommandRegistry } from '@za38.03/agent-ui-plugins/composer-triggers';
import { ConversationCommandSourcePlugin } from './index';

export const businessCommands = {
  async loadCommands(_input: {
    locale: AgentUILocaleCode;
    signal: AbortSignal;
  }): Promise<readonly ConversationSlashCommand[]> {
    // 在这里调用项目的命令列表请求，并处理鉴权和返回字段转换。
    // _input.locale 是当前语言；_input.signal 用于取消请求。
    // 返回命令数组；默认没有业务命令，保留“新建会话”。
    return [];
  },
};

export const conversationCommandSourcePlugin: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [CONVERSATION_COMMAND_SOURCE],
  setup: implementation.bindSetup(({ services, actions }: Parameters<NonNullable<UIPluginDefinition['setup']>>[0]) => {
    const source = createConversationCommandRegistry();
    services.provide(CONVERSATION_COMMAND_SOURCE, source);
    const locale = services.get(AGENT_UI_LOCALE_SERVICE);
    let unregister: (() => void) | undefined;
    let request: AbortController | undefined;
    let removeBusinessCommands: (() => void)[] = [];
    const clearBusinessCommands = () => {
      removeBusinessCommands.forEach((remove) => remove());
      removeBusinessCommands = [];
    };
    const register = () => {
      unregister?.();
      request?.abort();
      clearBusinessCommands();
      const controller = new AbortController();
      request = controller;
      const code = locale?.getSnapshot().locale ?? 'zh-CN';
      unregister = source.register({
        id: 'new',
        label: (locale?.getMessages?.() ?? resolveAgentUILocaleMessages(code)).conversationTriggers.newConversation,
        mode: 'action',
        execute: () => Promise.resolve(actions.startNewConversation()).then(() => undefined),
      });
      void businessCommands
        .loadCommands({ locale: code, signal: controller.signal })
        .then((commands) => {
          if (controller.signal.aborted) return;
          try {
            for (const command of commands) {
              removeBusinessCommands.push(source.register(command));
            }
          } catch (error) {
            clearBusinessCommands();
            throw error;
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) console.error('COMMANDS_LOAD_FAILED', error);
        });
    };
    register();
    const unsubscribe = locale?.subscribe(register);
    return () => {
      unsubscribe?.();
      request?.abort();
      unregister?.();
      clearBusinessCommands();
    };
  }),
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: ConversationCommandSourcePlugin,
};
export default conversationCommandSourcePlugin;
