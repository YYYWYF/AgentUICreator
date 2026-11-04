import { ConversationComposerDictate, ConversationComposerStopDictation } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import type { ComponentProps, ReactNode } from 'react';
type Appearance = Pick<
  NonNullable<ComponentProps<typeof ConversationComposerDictate>>,
  'className' | 'style' | 'disabled'
>;
export function ConversationDictationActionPlugin({
  startButtonProps,
  stopButtonProps,
  startText,
  stopText,
  className,
  style,
  disabled,
  children,
}: UIPluginComponentProps &
  Appearance & {
    startButtonProps?: ComponentProps<typeof ConversationComposerDictate>;
    stopButtonProps?: ComponentProps<typeof ConversationComposerStopDictation>;
    startText?: string;
    stopText?: string;
    children?: ReactNode;
  }) {
  return (
    <>
      {children ?? (
        <>
          <ConversationComposerDictate
            className={className}
            style={style}
            disabled={disabled}
            {...(startText === undefined ? {} : { label: startText })}
            {...startButtonProps}
          />
          <ConversationComposerStopDictation
            className={className}
            style={style}
            disabled={disabled}
            {...(stopText === undefined ? {} : { label: stopText })}
            {...stopButtonProps}
          />
        </>
      )}
    </>
  );
}
