'use client';

import { useLocale } from '../../../../../locale.js';
import { QuoteSelectableText } from '../../../../../internal/quote-selectable-text.js';
import { Sources } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/sources.aui.js';
import { File } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/file.js';
import { Image } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/image.js';
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/reasoning.aui.js';
import { ToolFallback } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.js';
import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import { useContext, type FC } from 'react';
import { projectToolTimeline } from '../../../../../internal/tool-timeline-projection.js';
import { resolveConversationTurnGroup } from '../../../../../internal/conversation-turn.js';
import { ThreadComponentsContext } from './thread-context.js';
import { taskAwareGroupBy, messageGroupBy, ToolGroupHost } from './assistant-message-groups.js';
import { MessageError } from './message-error.js';
import { AssistantResponseFooterHost } from './response-footer-host.js';
import { AssistantMessageIdentity } from '../message-identity.js';

export const AssistantMessage: FC = () => {
  const localeMessages = useLocale();
  const {
    ToolFallback: ToolFallbackComponent = ToolFallback,
    ToolGroup,
    ToolTimeline,
    ThinkingIndicator,
    reasoningVisible = true,
    ReasoningGroup,
    TaskGroup: TaskGroupComponent,
    AssistantResponseFooter,
  } = useContext(ThreadComponentsContext);
  const AssistantResponseFooterComponent = AssistantResponseFooter;
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const labels = localeMessages.conversation;
  // Presentation only: response actions and persistence still read real content.
  const showCancelledEmptyFallback = useAuiState(
    (s) =>
      s.message.status?.type === 'incomplete' &&
      s.message.status.reason === 'cancelled' &&
      s.message.content.length === 0,
  );
  const parts = useAuiState((s) => s.message.parts);
  const continuesTurn = useAuiState((s) => {
    const message = s.thread.messages[s.message.index];
    const turn = resolveConversationTurnGroup(s.thread.messages, message?.id ?? '');
    return turn !== null && turn.headAssistantMessageId !== message?.id;
  });
  const toolUIs = useAuiState((s) => s.tools.toolUIs);
  const timeline = projectToolTimeline(parts, toolUIs);
  const baseGroupBy = TaskGroupComponent ? taskAwareGroupBy : messageGroupBy;
  const groupBy = ToolTimeline
    ? (part: Parameters<typeof messageGroupBy>[0], context?: Parameters<typeof messageGroupBy>[1]) => {
        const path = baseGroupBy(part, context);
        // TaskCard owns nested transcripts and keeps its pending/error actions visible.
        // Timeline protection must not downgrade it to the ordinary tool fallback.
        if (path.includes('group-task')) return path;
        // Ordinary summarized tools and protected actions stay in their chronological
        // position. Protected tools must never sit inside a collapsed ToolGroup.
        if (
          part.type === 'tool-call' &&
          timeline.calls.some((call) => call.toolCallId === part.toolCallId && (call.summarized || call.protected))
        )
          return [];
        return path;
      }
    : baseGroupBy;

  return (
    <MessagePrimitive.Root
      data-slot='aui_assistant-message-root'
      data-role='assistant'
      data-assistant-turn-continuation={continuesTurn ? 'true' : undefined}
      data-aui-quote-selectable='false'
      className='fade-in slide-in-from-bottom-1 animate-in relative duration-150'
    >
      <AssistantMessageIdentity />
      <div
        data-agent-ui-owned=''
        data-slot='aui_assistant-message-content'
        className='text-foreground px-2 leading-relaxed wrap-break-word'
      >
        {showCancelledEmptyFallback ? (
          <div data-agent-ui-owned='' data-slot='aui_assistant-message-cancelled' className='text-muted-foreground'>
            {labels.generationStopped}
          </div>
        ) : (
          <div data-agent-ui-owned='' data-slot='aui_assistant-message-parts'>
            {ThinkingIndicator ? (
              <ThinkingIndicator reasoningVisible={reasoningVisible} timelineVisible={!!ToolTimeline} />
            ) : null}
            <MessagePrimitive.GroupedParts groupBy={groupBy}>
              {({ part, children }) => {
                switch (part.type) {
                  case 'group-chainOfThought':
                    return (
                      <div data-agent-ui-owned='' data-slot='aui_chain-of-thought'>
                        {children}
                      </div>
                    );
                  case 'group-task':
                    return TaskGroupComponent ? (
                      <TaskGroupComponent group={part}>{children}</TaskGroupComponent>
                    ) : (
                      children
                    );
                  case 'group-tool':
                    return (
                      <ToolGroupHost group={part} Component={ToolGroup}>
                        {children}
                      </ToolGroupHost>
                    );
                  case 'group-reasoning': {
                    if (!part.indices.some((index) => parts[index]?.type === 'reasoning' && parts[index].text.trim()))
                      return null;
                    if (ThinkingIndicator && !reasoningVisible) return null;
                    if (ReasoningGroup) {
                      return <ReasoningGroup group={part}>{children}</ReasoningGroup>;
                    }
                    const running = part.status.type === 'running';
                    return (
                      <ReasoningRoot className='mb-0' streaming={running}>
                        <ReasoningTrigger active={running} />
                        <ReasoningContent aria-busy={running}>
                          <ReasoningText>{children}</ReasoningText>
                        </ReasoningContent>
                      </ReasoningRoot>
                    );
                  }
                  case 'text':
                    return part.text.trim() ? <QuoteSelectableText /> : null;
                  case 'reasoning':
                    if (!part.text.trim() || (ThinkingIndicator && !reasoningVisible)) return null;
                    return <Reasoning {...part} />;
                  case 'tool-call': {
                    const call = timeline.calls.find((call) => call.toolCallId === part.toolCallId);
                    if (ToolTimeline && call?.summarized) {
                      const anchor = call.toolCallId === timeline.anchorId;
                      return (
                        <>
                          {anchor ? (
                            <ToolTimeline>
                              {timeline.detailIndices.map((index) => (
                                <MessagePrimitive.PartByIndex
                                  key={parts[index]?.type === 'tool-call' ? parts[index].toolCallId : index}
                                  index={index}
                                  components={{ tools: { Fallback: ToolFallbackComponent } }}
                                />
                              ))}
                            </ToolTimeline>
                          ) : null}
                          {call.protected ? (part.toolUI ?? <ToolFallbackComponent {...part} />) : null}
                        </>
                      );
                    }
                    return part.toolUI ?? <ToolFallbackComponent {...part} />;
                  }
                  case 'source':
                    return <Sources {...part} />;
                  case 'data':
                    return part.dataRendererUI;
                  case 'file':
                    return (
                      <div data-agent-ui-owned='' data-slot='aui_assistant-message-file' className='py-1'>
                        <File {...part} />
                      </div>
                    );
                  case 'image':
                    return (
                      <div data-agent-ui-owned='' data-slot='aui_assistant-message-image' className='py-1'>
                        <Image {...part} />
                      </div>
                    );
                  case 'indicator':
                    if (ThinkingIndicator) return null;
                    return (
                      <span
                        data-agent-ui-owned=''
                        data-slot='aui_assistant-message-indicator'
                        className='animate-pulse font-sans'
                        aria-label={localeMessages.conversation.working}
                      >
                        {'●'}
                      </span>
                    );
                  default:
                    return null;
                }
              }}
            </MessagePrimitive.GroupedParts>
          </div>
        )}
        <MessageError />
      </div>

      {!isRunning ? <AssistantResponseFooterHost FooterComponent={AssistantResponseFooterComponent} /> : null}
    </MessagePrimitive.Root>
  );
};
