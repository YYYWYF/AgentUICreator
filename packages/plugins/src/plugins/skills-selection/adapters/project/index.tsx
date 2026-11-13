import { ConversationSkillsSelection, type ConversationSkillsSelectionPluginProps } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import './styles.css';
export function SkillsSelectionPlugin({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: Partial<UIPluginComponentProps> & ConversationSkillsSelectionPluginProps) {
  return <ConversationSkillsSelection {...props} />;
}
