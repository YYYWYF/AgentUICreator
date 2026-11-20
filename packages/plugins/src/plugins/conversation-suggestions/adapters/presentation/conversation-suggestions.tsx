'use client';
import type { ComposerData } from '@za38.03/agent-ui-plugins/composer-support';
import { Fragment, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { ConversationParts, SuggestionActions } from '../../../../plugin-support.js';
import { ConversationSuggestion, ConversationSuggestionTrigger } from '../../../../public.js';
export interface ConversationSuggestionItem {
  title?: string;
  label?: string;
  prompt: string;
  data?: ComposerData;
}
export interface ConversationCanonicalSuggestionsProps extends Omit<ComponentProps<'div'>, 'children'> {
  items?: readonly ConversationSuggestionItem[];
  sendOnSelect?: boolean;
  clearComposer?: boolean;
  buttonProps?: Omit<ComponentProps<typeof SuggestionActions.Trigger>, 'send' | 'clearComposer' | 'children'>;
  classNames?: Partial<Record<'title' | 'description', string>>;
  styles?: Partial<Record<'title' | 'description', CSSProperties>>;
  renderSuggestion?: (item: ConversationSuggestionItem, defaultView: ReactNode) => ReactNode;
}
export function ConversationCanonicalSuggestions({
  items,
  sendOnSelect = true,
  clearComposer,
  buttonProps,
  classNames,
  styles,
  renderSuggestion,
  ...elementProps
}: ConversationCanonicalSuggestionsProps) {
  const behavior = { send: sendOnSelect, ...(clearComposer === undefined ? {} : { clearComposer }) };
  const titleProps = {
    className: ['conversation-suggestion-title', classNames?.title].filter(Boolean).join(' '),
    style: styles?.title,
  };
  const descriptionProps = {
    className: ['conversation-suggestion-label', classNames?.description].filter(Boolean).join(' '),
    style: styles?.description,
  };
  return (
    <div
      {...elementProps}
      className={['conversation-suggestions-plugin', elementProps.className].filter(Boolean).join(' ')}
      data-ui-plugin='conversation-suggestions'
    >
      {items !== undefined ? (
        items.map((item, index) => {
          const view = (
            <ConversationSuggestion
              key={`${index}:${item.prompt}`}
              prompt={item.prompt}
              requestItem={item}
              {...behavior}
              data-agent-ui-owned=''
              className='conversation-suggestion'
              {...buttonProps}
            >
              <span {...titleProps}>{item.title ?? item.prompt}</span>
              {item.label === undefined ? null : <span {...descriptionProps}>{item.label}</span>}
            </ConversationSuggestion>
          );
          return renderSuggestion ? <Fragment key={`${index}:${item.prompt}`}>{renderSuggestion(item, view)}</Fragment> : view;
        })
      ) : (
        <ConversationParts.Suggestions>
          {({ suggestion }) => {
            const view = (
              <ConversationSuggestionTrigger
                data-agent-ui-owned=''
                className='conversation-suggestion'
                {...behavior}
                {...buttonProps}
              >
                <SuggestionActions.Title {...titleProps} />
                <SuggestionActions.Description {...descriptionProps} />
              </ConversationSuggestionTrigger>
            );
            return renderSuggestion ? renderSuggestion(suggestion, view) : view;
          }}
        </ConversationParts.Suggestions>
      )}
    </div>
  );
}
