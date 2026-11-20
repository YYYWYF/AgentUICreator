import { useLocale, useConversation } from '@za38.03/agent-ui-plugins';
import { useAgentRuntime } from '@za38.03/agent-ui-runtime';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

import type { AgentUIShellProps } from '@za38.03/agent-ui-runtime/ui';
import { AssistantRobot } from './AssistantRobot';
import { RobotRunFeedback } from './assistant-robot-motion';
import './assistant-shell.css';

export type AssistantShellProps = AgentUIShellProps;

export function AssistantShell({ children, surfaceRef, assistantPanelWidth: panelWidth = 416 }: AssistantShellProps) {
  const messages = useLocale('runtime');
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [clickSignal, setClickSignal] = useState(0);
  const [completionSignal, setCompletionSignal] = useState(0);
  const runStatus = useAgentRuntime(snapshot => snapshot.run.status);
  const conversationId = useAgentRuntime(snapshot => snapshot.conversation.id);
  const lastMessage = useConversation(state => state.thread.messages.at(-1));
  const feedback = useRef(new RobotRunFeedback());
  useEffect(() => {
    if (feedback.current.observe(conversationId, runStatus, lastMessage)) setCompletionSignal(value => value + 1);
  }, [conversationId, runStatus, lastMessage]);
  const panelId = useId();

  return (
    <section
      className='agent-ui-assistant-shell'
      style={
        Number.isFinite(panelWidth) && panelWidth! > 0
          ? ({ '--agent-ui-assistant-panel-width': `${panelWidth}px` } as CSSProperties)
          : undefined
      }
    >
      <div
        ref={open ? surfaceRef : undefined}
        aria-label={messages.assistant}
        className='agent-ui-assistant-panel'
        hidden={!open}
        id={panelId}
        role='complementary'
      >
        {children}
      </div>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={open ? messages.closeAssistant : messages.openAssistant}
        className='agent-ui-assistant-trigger'
        onClick={() => { setOpen(current => !current); setClickSignal(value => value + 1); }}
        onPointerEnter={event => { if (event.pointerType !== 'touch') setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onPointerCancel={() => setHovered(false)}
        onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setHovered(true); }}
        onBlur={() => setHovered(false)}
        type='button'
      >
        <AssistantRobot hovered={hovered} clickSignal={clickSignal} completionSignal={completionSignal} activity={runStatus} conversationId={conversationId} />
      </button>
    </section>
  );
}
