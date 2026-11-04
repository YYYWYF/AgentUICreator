import type { ComponentProps, ComponentType, ReactNode } from 'react';
import {
  ConversationToolFallback,
  JobProgress,
  type ConversationToolCallProps,
  type UIPluginElementProps,
} from '../../../../public.js';
import { projectJobProgressState, projectRunCiJobArgs, projectRunCiJobResult } from './projection.js';
export interface JobProgressMessageProps extends ConversationToolCallProps, UIPluginElementProps {
  /** Supplied by the project's existing Runtime bridge, never a second store. */
  state?: unknown;
  abortRun?: () => void;
  title?: ComponentProps<typeof JobProgress>['title'];
  stages?: ComponentProps<typeof JobProgress>['stages'];
  stageIndex?: ComponentProps<typeof JobProgress>['stageIndex'];
  stageProgress?: ComponentProps<typeof JobProgress>['stageProgress'];
  eta?: ComponentProps<typeof JobProgress>['eta'];
  onCancel?: ComponentProps<typeof JobProgress>['onCancel'];
  outcome?: ComponentProps<typeof JobProgress>['outcome'];
  elapsedMs?: ComponentProps<typeof JobProgress>['elapsedMs'];
  renderProgress?: (props: ComponentProps<typeof JobProgress>, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
function lifecycleOutcome(tool: ConversationToolCallProps) {
  if (tool.isError === true) {
    return { status: 'failed' as const };
  }
  if (tool.status.type !== 'incomplete') {
    return null;
  }
  if (tool.status.reason === 'cancelled') {
    return { status: 'cancelled' as const };
  }
  if (tool.status.reason === 'error') {
    return { status: 'failed' as const };
  }
  return null;
}
export function CanonicalJobProgressMessage({
  state,
  abortRun,
  title,
  stages,
  stageIndex,
  stageProgress,
  eta,
  onCancel,
  outcome: presentationOutcome,
  elapsedMs,
  className,
  style,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescription,
  onClick,
  renderProgress,
  Fallback = ConversationToolFallback,
  ...tool
}: JobProgressMessageProps) {
  const rootProps = {
    className,
    style,
    id,
    role,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescription,
    onClick,
  };
  const overrides = Object.fromEntries(
    Object.entries({
      title,
      stages,
      stageIndex,
      stageProgress,
      eta,
      onCancel,
      outcome: presentationOutcome,
      elapsedMs,
    }).filter(([, value]) => value !== undefined),
  );
  const args = projectRunCiJobArgs(tool.args);
  const progress = projectJobProgressState(state, tool.toolCallId);
  const result = projectRunCiJobResult(tool.result);
  const outcome = result.outcome ?? lifecycleOutcome(tool);
  if (
    tool.status.type === 'requires-action' ||
    (tool.status.type === 'incomplete' && outcome === null) ||
    args === null ||
    progress === null ||
    (outcome === null && (tool.status.type === 'complete' || progress.stageIndex >= args.stages.length))
  ) {
    return <Fallback {...tool} />;
  }
  const props: ComponentProps<typeof JobProgress> = {
    title: args.target,
    stages: args.stages,
    stageIndex: progress.stageIndex,
    stageProgress: progress.stageProgress,
    eta: progress.eta,
    ...(outcome === null ? { onCancel: abortRun } : { outcome }),
    ...(result.elapsedMs === undefined ? {} : { elapsedMs: result.elapsedMs }),
    ...overrides,
    ...rootProps,
  };
  return <>{renderProgress ? renderProgress(props, tool) : <JobProgress {...props} />}</>;
}
