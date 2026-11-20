'use client';

import { isTaskPart } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/task-card.aui.js';
import { ConversationCanonicalToolGroup } from '../../../../tool-group/adapters/presentation/tool-group.js';
import { groupPartByType, useAuiState } from '@assistant-ui/react';
import { type FC, type PropsWithChildren } from 'react';
import { hasPendingToolAction } from '../../../../../internal/tool-timeline-projection.js';
import { useConversationCommandDecisions } from '../../../../../internal/conversation-command-decisions.js';
import { type ThreadGroupPart, type ThreadComponents } from './thread-context.js';

export const messageGroupBy = groupPartByType({
  reasoning: ['group-chainOfThought', 'group-reasoning'],
  'tool-call': ['group-chainOfThought', 'group-tool'],
  'standalone-tool-call': [],
});

export type ThreadGroupKey = 'group-chainOfThought' | 'group-reasoning' | 'group-tool' | 'group-task';

export const TASK_GROUP_PATH: readonly ThreadGroupKey[] = ['group-chainOfThought', 'group-task'];

export const taskAwareGroupBy = (
  part: Parameters<typeof messageGroupBy>[0],
  context?: Parameters<typeof messageGroupBy>[1],
): readonly ThreadGroupKey[] => {
  const path = messageGroupBy(part, context);
  return part.type === 'tool-call' && isTaskPart(part) && path.length > 0 && !context?.toolUIs?.[part.toolName]?.length
    ? TASK_GROUP_PATH
    : path;
};

export const ToolGroupHost: FC<
  PropsWithChildren<{
    group: ThreadGroupPart;
    Component: ThreadComponents['ToolGroup'];
  }>
> = ({ group, Component, children }) => {
  const parts = useAuiState((s) => s.message.parts);
  const commandDecisions = useConversationCommandDecisions();
  const toolGroup = {
    ...group,
    type: 'group-tool' as const,
    requiresAction: group.indices.some((index) => {
      const tool = parts[index];
      return tool?.type === 'tool-call' && (hasPendingToolAction(tool) || commandDecisions.has(tool.toolCallId));
    }),
  };
  return Component ? (
    <Component group={toolGroup}>{children}</Component>
  ) : (
    <ConversationCanonicalToolGroup group={toolGroup}>{children}</ConversationCanonicalToolGroup>
  );
};
