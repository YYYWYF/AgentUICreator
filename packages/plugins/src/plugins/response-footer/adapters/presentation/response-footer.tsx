"use client";
import type { ComponentProps, ReactNode } from "react";
import { ResponseActionBarRoot, ResponseBranchPicker } from "../../../../plugin-support.js";
export interface ConversationCanonicalResponseFooterProps {
  actions?: ReactNode; children?: ReactNode;
  rootProps?: ComponentProps<"div">;
  actionBarProps?: ComponentProps<typeof ResponseActionBarRoot>;
  branchPickerProps?: ComponentProps<typeof ResponseBranchPicker>;
}
export function ConversationCanonicalResponseFooter({actions, children, rootProps, actionBarProps, branchPickerProps}: ConversationCanonicalResponseFooterProps) {
  return <div className="flex items-center" data-ui-plugin="response-footer" data-slot="aui_assistant-response-footer-plugin" {...rootProps}>
    {children ?? rootProps?.children ?? <><ResponseBranchPicker {...branchPickerProps}/><ResponseActionBarRoot {...actionBarProps}>{actionBarProps?.children ?? actions}</ResponseActionBarRoot></>}
  </div>;
}
