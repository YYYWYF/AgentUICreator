import {
  ConversationSkillsBar,
  type ConversationSkillsPluginProps,
} from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import './styles.css';

export function SkillsPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: Partial<UIPluginComponentProps> & ConversationSkillsPluginProps) {
  return <ConversationSkillsBar {...props} />;
}
