import { useLocale, useConversation } from '@za38.03/agent-ui-plugins';
import { useAgentRuntime } from '@za38.03/agent-ui-runtime';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

import type { AgentUIShellProps } from '@za38.03/agent-ui-runtime/ui';
import { AssistantRobot } from './AssistantRobot';
import { RobotRunFeedback } from './assistant-robot-motion';
import './assistant-shell.css';

export type AssistantShellProps = AgentUIShellProps;

function useDraggableTrigger() {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const trigger = ref.current;
    if (!trigger) return;
    let x = 0, y = 0;
    let frame: number | undefined;
    let suppressClick = false;
    let moved = false;
    let drag: { pointerId: number; clientX: number; clientY: number; x: number; y: number; left: number; top: number; width: number; height: number } | undefined;
    const paint = () => {
      frame = undefined;
      trigger.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    const settle = () => {
      const rect = trigger.getBoundingClientRect();
      const density = window.devicePixelRatio || 1;
      // Commit a fixed, device-pixel-aligned position after the smooth drag.
      // Removing the drag transform also avoids retaining an extra raster layer.
      trigger.style.left = `${Math.max(0, Math.min(window.innerWidth - rect.width, Math.round(rect.left * density) / density))}px`;
      trigger.style.top = `${Math.max(0, Math.min(window.innerHeight - rect.height, Math.round(rect.top * density) / density))}px`;
      trigger.style.right = trigger.style.bottom = 'auto';
      trigger.style.removeProperty('transform');
      x = y = 0;
    };
    const finish = () => {
      if (frame !== undefined) { cancelAnimationFrame(frame); paint(); }
      const pointerId = drag?.pointerId;
      if (drag && suppressClick) settle();
      drag = undefined;
      delete trigger.dataset.dragging;
      if (pointerId !== undefined && trigger.hasPointerCapture(pointerId)) trigger.releasePointerCapture(pointerId);
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      suppressClick = false;
      // Disable the pressed scale before measuring so the avatar never jumps.
      trigger.dataset.dragging = '';
      const rect = trigger.getBoundingClientRect();
      drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y, left: rect.left - x, top: rect.top - y, width: rect.width, height: rect.height };
      trigger.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.clientX, dy = event.clientY - drag.clientY;
      if (!suppressClick && Math.hypot(dx, dy) < 5) return;
      suppressClick = true;
      moved = true;
      x = Math.max(-drag.left, Math.min(window.innerWidth - drag.width - drag.left, drag.x + dx));
      y = Math.max(-drag.top, Math.min(window.innerHeight - drag.height - drag.top, drag.y + dy));
      // Pointer events can arrive faster than display frames. Paint only the latest position.
      if (frame === undefined) frame = requestAnimationFrame(paint);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== drag?.pointerId) return;
      move(event);
      finish();
    };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId !== drag?.pointerId) return;
      suppressClick = true;
      finish();
    };
    const click = (event: MouseEvent) => {
      if (suppressClick && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
      }
      suppressClick = false;
    };
    const resize = () => {
      finish();
      if (!moved) return;
      settle();
    };
    trigger.addEventListener('pointerdown', down);
    trigger.addEventListener('pointermove', move);
    trigger.addEventListener('pointerup', up);
    trigger.addEventListener('pointercancel', cancel);
    trigger.addEventListener('lostpointercapture', cancel);
    trigger.addEventListener('click', click, true);
    window.addEventListener('resize', resize);
    return () => {
      finish();
      trigger.removeEventListener('pointerdown', down);
      trigger.removeEventListener('pointermove', move);
      trigger.removeEventListener('pointerup', up);
      trigger.removeEventListener('pointercancel', cancel);
      trigger.removeEventListener('lostpointercapture', cancel);
      trigger.removeEventListener('click', click, true);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return ref;
}

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
  const triggerRef = useDraggableTrigger();

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
        ref={triggerRef}
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
