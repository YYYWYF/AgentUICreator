import { ConversationComposerCancel, ConversationComposerSend } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import type { ComponentProps, ReactNode } from 'react';
type Appearance = Pick<
  NonNullable<ComponentProps<typeof ConversationComposerSend>>,
  'className' | 'style' | 'disabled'
>;
export function ConversationSubmitActionPlugin({
  sendButtonProps,
  cancelButtonProps,
  sendText,
  cancelText,
  className,
  style,
  disabled,
  children,
}: UIPluginComponentProps &
  Appearance & {
    sendButtonProps?: ComponentProps<typeof ConversationComposerSend>;
    cancelButtonProps?: ComponentProps<typeof ConversationComposerCancel>;
    sendText?: string;
    cancelText?: string;
    children?: ReactNode;
  }) {
  return (
    <>
      {children ?? (
        <>
          <ConversationComposerSend
            className={className}
            style={style}
            disabled={disabled}
            {...(sendText === undefined ? {} : { label: sendText })}
            {...sendButtonProps}
          />
          <ConversationComposerCancel
            className={className}
            style={style}
            disabled={disabled}
            {...(cancelText === undefined ? {} : { label: cancelText })}
            {...cancelButtonProps}
          />
        </>
      )}
    </>
  );
}
