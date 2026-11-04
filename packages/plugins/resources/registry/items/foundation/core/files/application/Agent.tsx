import { resolveAgentUILocaleMessages } from '@za38.03/agent-ui-plugins';
import { AgentApplication, type AgentProps } from '@za38.03/agent-ui-runtime/ui';
import { agentUIProject } from './project-config';
export type { AgentProps } from '@za38.03/agent-ui-runtime/ui';

export function Agent(props: AgentProps = {}) {
  const suggestions: AgentProps['suggestions'] = (locale) => {
    const messages = resolveAgentUILocaleMessages(locale, props.locales?.[locale]).starterSuggestions;
    return [
      { title: messages.architectureTitle, label: messages.architectureLabel, prompt: messages.architecturePrompt },
      { title: messages.debugTitle, label: messages.debugLabel, prompt: messages.debugPrompt },
      { title: messages.nextTitle, label: messages.nextLabel, prompt: messages.nextPrompt },
    ];
  };
  return <AgentApplication project={agentUIProject} {...props} suggestions={props.suggestions ?? suggestions} />;
}
