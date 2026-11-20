'use client';

import { useLocale } from '../../../../../locale.js';
import { TooltipIconButton } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tooltip-icon-button.js';
import { cn } from '../../../../../internal/vendor-generated/assistant-ui/lib/utils.js';
import { ActionBarPrimitive, BranchPickerPrimitive, useAuiState } from '@assistant-ui/react';
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon } from 'lucide-react';
import { type FC } from 'react';
import { useAssistantResponseRuntime } from '../../../../../internal/assistant-response-runtime.js';
import { CanonicalResponseCopyAction } from '../../../../copy-action/adapters/presentation/copy-action.js';
import { CanonicalResponseReloadAction } from '../../../../reload-action/adapters/presentation/reload-action.js';
import { CanonicalResponseExportMarkdownAction } from '../../../../export-markdown-action/adapters/presentation/export-markdown-action.js';

export const ResponseActionBarRoot: FC<import('../../../../../public.js').ConversationResponseActionBarProps> = ({
  children,
  ...props
}) => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide='not-last'
    className='aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ms-1 flex gap-1 duration-200'
    {...props}
  >
    {children}
  </ActionBarPrimitive.Root>
);

export const ResponseBranchPicker: FC<import('../../../../../public.js').ConversationResponseBranchPickerProps> = ({
  hideWhenSingleBranch = true,
  previousProps,
  nextProps,
  children,
  ...props
}) => {
  const localeMessages = useLocale();
  const response = useAssistantResponseRuntime();
  const canSwitchBranch = useAssistantResponseRuntime((snapshot) => snapshot.canSwitchBranch);
  const branchNumber = useAssistantResponseRuntime((snapshot) => snapshot.branchNumber);
  const branchCount = useAssistantResponseRuntime((snapshot) => snapshot.branchCount);
  if (hideWhenSingleBranch && (branchCount <= 1 || !canSwitchBranch)) return null;
  return (
    <div
      className='aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs'
      {...props}
    >
      {children ?? (
        <>
          <TooltipIconButton
            tooltip={localeMessages.common.previous}
            type='button'
            {...previousProps}
            disabled={!canSwitchBranch || branchNumber <= 1 || previousProps?.disabled}
            onClick={(event) => {
              previousProps?.onClick?.(event);
              if (!event.defaultPrevented && canSwitchBranch) response.switchToPreviousBranch();
            }}
          >
            <ChevronLeftIcon />
          </TooltipIconButton>
          <span className='aui-branch-picker-state font-medium'>
            {branchNumber} / {branchCount}
          </span>
          <TooltipIconButton
            tooltip={localeMessages.common.next}
            type='button'
            {...nextProps}
            disabled={!canSwitchBranch || branchNumber >= branchCount || nextProps?.disabled}
            onClick={(event) => {
              nextProps?.onClick?.(event);
              if (!event.defaultPrevented && canSwitchBranch) response.switchToNextBranch();
            }}
          >
            <ChevronRightIcon />
          </TooltipIconButton>
        </>
      )}
    </div>
  );
};

export const CanonicalAssistantResponseFooter: FC = () => (
  <>
    <ResponseBranchPicker />
    <AssistantActionBar />
  </>
);

export const AssistantActionBar: FC = () => (
  <ResponseActionBarRoot>
    <CanonicalResponseCopyAction />
    <CanonicalResponseReloadAction />
    <CanonicalResponseExportMarkdownAction />
  </ResponseActionBarRoot>
);

export const UserActionBar: FC = () => {
  const localeMessages = useLocale();
  const isDisabled = useAuiState((s) => s.thread.isDisabled);
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide='not-last'
      className='aui-user-action-bar-root flex flex-col items-end'
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip={localeMessages.common.edit} disabled={isDisabled} className='aui-user-action-edit'>
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

export const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  const localeMessages = useLocale();
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        'aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs',
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip={localeMessages.common.previous}>
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className='aui-branch-picker-state font-medium'>
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip={localeMessages.common.next}>
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
