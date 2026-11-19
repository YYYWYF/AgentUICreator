import type { ComponentProps, ComponentType, ReactNode } from 'react';
import {
  ConversationToolFallback,
  WebSearch,
  type ConversationToolCallProps,
  type UIPluginElementProps,
  type WebSearchProps,
} from '../../../../public.js';
import { projectWebSearch } from './projection.js';
export interface WebSearchPluginProps extends ConversationToolCallProps, UIPluginElementProps {
  visibleResults?: ComponentProps<typeof WebSearch>['visibleResults'];
  renderSearch?: (props: WebSearchProps, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalWebSearch({
  visibleResults,
  className,
  style,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescription,
  onClick,
  renderSearch,
  Fallback = ConversationToolFallback,
  ...tool
}: WebSearchPluginProps) {
  const rootProps = {
    className,
    style,
    id,
    role,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescription,
    onClick,
  };
  const view = projectWebSearch(tool);
  if (view === null) {
    return <Fallback {...tool} />;
  }
  const props: WebSearchProps = {
    ...view,
    ...(visibleResults === undefined ? {} : { visibleResults }),
    ...rootProps,
  };
  return <>{renderSearch ? renderSearch(props, tool) : <WebSearch {...props} />}</>;
}
