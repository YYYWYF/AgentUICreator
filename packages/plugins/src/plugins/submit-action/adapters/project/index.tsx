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
  className,
  style,
  disabled,
  children,
}: UIPluginComponentProps &
  Appearance & {
    sendButtonProps?: ComponentProps<typeof ConversationComposerSend>;
    cancelButtonProps?: ComponentProps<typeof ConversationComposerCancel>;
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
            {...sendButtonProps}
          />
          <ConversationComposerCancel
            className={className}
            style={style}
            disabled={disabled}
            {...cancelButtonProps}
          />
        </>
      )}
    </>
  );
}
