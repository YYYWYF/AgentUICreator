import {
  type ConversationCanonicalComposerProps,
  ConversationCanonicalComposer,
  ConversationComposerTextareaInput,
} from '@za38.03/agent-ui-plugins';

import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';

export function ConversationComposerPlugin({
  renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: UIPluginComponentProps & ConversationCanonicalComposerProps) {
  const fallbackInput = (
    <ConversationComposerTextareaInput
      {...props.inputProps}
      {...(props.rows === undefined ? {} : { rows: props.rows })}
      {...(props.maxLength === undefined ? {} : { maxLength: props.maxLength })}
      {...(props.submitMode === undefined ? {} : { submitMode: props.submitMode })}
    />
  );
  return (
    <div data-ui-plugin='composer' data-slot='aui_composer-plugin'>
      <ConversationCanonicalComposer
        {...props}
        triggers={renderSlot('triggers', props.triggers ?? null)}
        input={renderSlot('input', props.input ?? fallbackInput)}
        beforeInput={renderSlot('beforeInput', props.beforeInput ?? null)}
        leadingActions={renderSlot('leadingActions', props.leadingActions ?? null, { layout: 'inline' })}
        trailingActions={renderSlot('trailingActions', props.trailingActions ?? null, { layout: 'inline' })}
        submitAction={renderSlot('submitAction', props.submitAction ?? null, { layout: 'inline' })}
      />
    </div>
  );
}
