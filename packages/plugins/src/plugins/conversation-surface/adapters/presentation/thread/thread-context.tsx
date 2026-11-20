'use client';

import { type ConversationTransientMessagesRenderScope } from '../../../../../internal/conversation-transient-messages.js';
import { ToolFallback } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.js';
import { MessagePrimitive, type ToolCallMessagePartComponent } from '@assistant-ui/react';
import { createContext, type ComponentType, type PropsWithChildren, type ReactNode } from 'react';
import { AssistantMessage } from './assistant-message.js';

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override assistant
 * message groups, tool calls, or its footer. Tool UIs registered by name
 * (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`.
 */
export type ThreadComponents = {
  TransientMessages?: ComponentType<ConversationTransientMessagesRenderScope> | undefined;
  UserEditComposer?: ComponentType | undefined;
  AssistantMessage?: ComponentType | undefined;
  AssistantResponseFooter?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  FollowupSuggestions?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  ThinkingIndicator?: ComponentType<{ reasoningVisible: boolean; timelineVisible: boolean }> | undefined;
  reasoningVisible?: boolean | undefined;
  ToolTimeline?: ComponentType<PropsWithChildren> | undefined;
  ToolGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined;
  ReasoningGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined;
  TaskGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
  autoFocus?: boolean | undefined;
  /** Product-owned composition seam; null means the host intentionally has no Composer. */
  composer?: ReactNode | null | undefined;
};

export const EMPTY_COMPONENTS: ThreadComponents = {};

export const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS);
