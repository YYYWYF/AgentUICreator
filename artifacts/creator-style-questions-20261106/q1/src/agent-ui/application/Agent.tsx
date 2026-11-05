import { resolveAgentUILocaleMessages } from '@za38.03/agent-ui-plugins';
import { AgentApplication, type AgentProps } from '@za38.03/agent-ui-runtime/ui';
import { agentUIProject } from './project-config';
export type { AgentProps } from '@za38.03/agent-ui-runtime/ui';

/** 空会话欢迎语，中英文保持一致。 */
const welcomeCopy = {
  'zh-CN': '今天心情好吗',
  'en-US': 'How are you feeling today?',
} as const;

export function Agent(props: AgentProps = {}) {
  const locales: AgentProps['locales'] = {
    ...props.locales,
    'zh-CN': {
      ...props.locales?.['zh-CN'],
      conversation: { ...props.locales?.['zh-CN']?.conversation, welcome: welcomeCopy['zh-CN'] },
    },
    'en-US': {
      ...props.locales?.['en-US'],
      conversation: { ...props.locales?.['en-US']?.conversation, welcome: welcomeCopy['en-US'] },
    },
  };
  const suggestions: AgentProps['suggestions'] = (locale) => {
    const messages = resolveAgentUILocaleMessages(locale, props.locales?.[locale]).starterSuggestions;
    return [
      { title: messages.architectureTitle, label: messages.architectureLabel, prompt: messages.architecturePrompt },
      { title: messages.debugTitle, label: messages.debugLabel, prompt: messages.debugPrompt },
      { title: messages.nextTitle, label: messages.nextLabel, prompt: messages.nextPrompt },
    ];
  };
  return (
    <AgentApplication
      project={agentUIProject}
      {...props}
      locales={locales}
      suggestions={props.suggestions ?? suggestions}
    />
  );
}
