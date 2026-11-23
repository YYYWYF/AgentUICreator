import type { AgentUILocaleCode } from '@za38.03/agent-ui-plugins';

const zhCN = {
  projectWorkspace: {
    title: '项目空间',
    description: '此为项目空间插件示意占位，真实业务界面需自行开发',
    backToChat: '返回当前会话',
  },
};

const enUS: typeof zhCN = {
  projectWorkspace: {
    title: 'Project workspace',
    description: 'This is a placeholder for the project workspace plugin. The actual business interface must be implemented separately.',
    backToChat: 'Back to current chat',
  },
};

const messages: Record<AgentUILocaleCode, typeof zhCN> = { 'zh-CN': zhCN, 'en-US': enUS };

export function getProjectMessages(locale: AgentUILocaleCode) {
  return messages[locale];
}
