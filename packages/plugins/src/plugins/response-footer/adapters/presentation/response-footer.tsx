'use client';
import type { ComponentProps, ReactNode } from 'react';
import { ResponseActionBarRoot, ResponseBranchPicker } from '../../../../plugin-support.js';
export interface ConversationCanonicalResponseFooterProps extends Omit<ComponentProps<'div'>, 'children'> {
  actions?: ReactNode;

  actionBarProps?: Omit<ComponentProps<typeof ResponseActionBarRoot>, 'children'>;
  branchPickerProps?: Omit<ComponentProps<typeof ResponseBranchPicker>, 'children'>;
}
export function ConversationCanonicalResponseFooter({
  actions,
  actionBarProps,
  branchPickerProps,
  ...rootProps
}: ConversationCanonicalResponseFooterProps) {
  return (
    <div
      {...rootProps}
      className={['flex items-center', rootProps.className].filter(Boolean).join(' ')}
      data-ui-plugin='response-footer'
      data-slot='aui_assistant-response-footer-plugin'
    >
      <ResponseBranchPicker {...branchPickerProps} />
      <ResponseActionBarRoot {...actionBarProps}>{actions}</ResponseActionBarRoot>
    </div>
  );
}
