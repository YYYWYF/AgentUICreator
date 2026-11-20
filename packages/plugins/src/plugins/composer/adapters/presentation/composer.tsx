'use client';

import {
  type ConversationComposerDropzoneProps,
  type ConversationComposerInputProps,
  type ConversationComposerRootProps,
  ComposerAttachments,
  ComposerHostConfigContext,
  ComposerInputHostContext,
  ComposerPrimitive,
  useLocale,
  useAuiEvent,
  useComposer,
  type ComposerRequestAdapter,
} from '../../../../composer-support.js';

import { useContext, useState, type FC, type ReactNode } from 'react';

import { ComposerTextareaInput } from './textarea.js';
import { useComposerRequestAdapter } from '../../../../internal/composer-request-adapter.js';

function ComposerAttachmentError() {
  const messages = useLocale();
  const [error, setError] = useState<string | null>(null);
  useAuiEvent('composer.attachmentAddError', (event) => {
    if (event.messageId !== undefined) {
      return;
    }
    setError(
      event.reason === 'no-adapter'
        ? messages.attachments.unavailable
        : event.reason === 'not-accepted'
          ? messages.serviceAdapters.fileTypeRejected
          : event.message || messages.attachments.uploadFailed,
    );
  });
  useAuiEvent('composer.attachmentAdd', () => setError(null));
  useAuiEvent('composer.send', () => setError(null));
  useAuiEvent('threads.selectionChanged', () => setError(null));
  return error === null ? null : (
    <p
      data-agent-ui-owned=''
      data-slot='aui_composer-attachment-error'
      role='alert'
      className='text-destructive text-sm'
    >
      {error}
    </p>
  );
}

export interface CanonicalComposerProps extends Omit<ConversationComposerRootProps, 'children'> {
  /** Final request assembly. Returned forwardedProps replaces all defaults. */
  requestAdapter?: ComposerRequestAdapter | undefined;
  rows?: ConversationComposerInputProps['rows'];
  maxLength?: ConversationComposerInputProps['maxLength'];
  submitMode?: ConversationComposerInputProps['submitMode'];
  inputProps?: Omit<
    ConversationComposerInputProps,
    'rows' | 'maxLength' | 'submitMode' | 'autoFocus' | 'children' | 'value' | 'defaultValue'
  >;
  dropzoneProps?: Omit<ConversationComposerDropzoneProps, 'children'>;
  autoFocus?: boolean | undefined;
  placeholder: string;
  inputAriaLabel: string;
  triggers?: ReactNode;
  beforeInput?: ReactNode;
  input?: ReactNode;
  leadingActions?: ReactNode;
  trailingActions?: ReactNode;
  submitAction?: ReactNode;
}

export const CanonicalComposer: FC<CanonicalComposerProps> = ({
  requestAdapter,
  rows,
  maxLength,
  submitMode,
  inputProps,
  dropzoneProps,
  autoFocus,
  placeholder,
  inputAriaLabel,
  triggers,
  beforeInput,
  input,
  leadingActions,
  trailingActions,
  submitAction,
  ...rootProps
}) => {
  useComposerRequestAdapter(requestAdapter);
  const resolvedInputProps = {
    ...inputProps,
    ...(rows === undefined ? {} : { rows }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(submitMode === undefined ? {} : { submitMode }),
  };
  const inheritedHostConfig = useContext(ComposerHostConfigContext);
  const resolvedAutoFocus = autoFocus ?? inheritedHostConfig.autoFocus;
  const composer = useComposer();

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root
        {...rootProps}
        className={['aui-composer-root relative flex w-full flex-col', rootProps.className].filter(Boolean).join(' ')}
        onSubmit={(event) => {
          rootProps?.onSubmit?.(event);
          if (composer.awaitingReply) {
            event.preventDefault();
            composer.send();
          }
        }}
      >
        {triggers}
        <ComposerPrimitive.AttachmentDropzone asChild {...dropzoneProps}>
          <div
            data-agent-ui-owned=''
            data-slot='aui_composer-shell'
            className='border-border/60 data-[dragging=true]:border-ring focus-within:border-border dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) transition-[border-color] data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))]'
          >
            <ComposerAttachments />
            <ComposerAttachmentError />
            <div data-agent-ui-owned='' data-slot='aui_composer-before-input' className='empty:hidden'>
              {beforeInput}
            </div>
            <ComposerInputHostContext.Provider
              value={{ variant: 'primary', placeholder, inputAriaLabel, autoFocus: resolvedAutoFocus }}
            >
              <div
                data-agent-ui-owned=''
                data-slot='aui_composer-input'
                className='min-w-0'
                onKeyDownCapture={(event) => {
                  // Only guard the primary input; sibling Slot controls keep their keyboard behavior.
                  if (
                    composer.awaitingReply &&
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.nativeEvent.keyCode !== 229
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    composer.send();
                  }
                }}
              >
                {input ?? <ComposerTextareaInput {...resolvedInputProps} />}
              </div>
            </ComposerInputHostContext.Provider>
            <div
              data-slot='aui_composer-actions'
              className='aui-composer-action-wrapper relative flex items-center justify-between'
            >
              <div
                data-agent-ui-owned=''
                data-slot='aui_composer-leading-actions'
                className='flex items-center gap-1.5'
              >
                {leadingActions}
              </div>
              <div
                data-agent-ui-owned=''
                data-slot='aui_composer-trailing-actions'
                className='flex items-center gap-1.5'
              >
                {trailingActions}
                {submitAction}
              </div>
            </div>
          </div>
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
};

export type ConversationCanonicalComposerProps = Omit<
  CanonicalComposerProps,
  'placeholder' | 'inputAriaLabel'
>;

export function ConversationCanonicalComposer(props: ConversationCanonicalComposerProps) {
  const labels = useLocale('composer');
  return (
    <CanonicalComposer {...props} placeholder={labels.placeholder} inputAriaLabel={labels.input} />
  );
}
export { ComposerTextareaInput as ConversationComposerTextareaInput } from './textarea.js';
