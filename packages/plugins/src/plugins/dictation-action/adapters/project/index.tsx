import { ConversationComposerDictate, ConversationComposerStopDictation } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import type { ComponentProps } from 'react';
type Appearance = Pick<
  NonNullable<ComponentProps<typeof ConversationComposerDictate>>,
  'className' | 'style' | 'disabled'
>;
export function ConversationDictationActionPlugin({
  startButtonProps,
  stopButtonProps,
  className,
  style,
  disabled,
}: UIPluginComponentProps &
  Appearance & {
    startButtonProps?: ComponentProps<typeof ConversationComposerDictate>;
    stopButtonProps?: ComponentProps<typeof ConversationComposerStopDictation>;
  }) {
  return (
    <>
      <ConversationComposerDictate className={className} style={style} disabled={disabled} {...startButtonProps} />
      <ConversationComposerStopDictation className={className} style={style} disabled={disabled} {...stopButtonProps} />
    </>
  );
}
