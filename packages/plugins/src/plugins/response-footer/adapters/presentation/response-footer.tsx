'use client';
import type { ComponentProps, ReactNode } from 'react';
import { ResponseActionBarRoot, ResponseBranchPicker } from '../../../../plugin-support.js';
export interface ConversationCanonicalResponseFooterProps extends Omit<ComponentProps<'div'>, 'children'> {
  actions?: ReactNode;
  children?: ReactNode;

  actionBarProps?: ComponentProps<typeof ResponseActionBarRoot>;
  branchPickerProps?: ComponentProps<typeof ResponseBranchPicker>;
}
export function ConversationCanonicalResponseFooter({
  actions,
  children,
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
      {children ?? (
        <>
          <ResponseBranchPicker {...branchPickerProps} />
          <ResponseActionBarRoot {...actionBarProps}>{actionBarProps?.children ?? actions}</ResponseActionBarRoot>
        </>
      )}
    </div>
  );
}
