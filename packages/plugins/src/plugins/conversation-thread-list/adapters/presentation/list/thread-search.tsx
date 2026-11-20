'use client';

import { Button } from '../../../../../internal/adapters-generated/assistant-ui/components/ui/button';
import { Input } from '../../../../../internal/adapters-generated/assistant-ui/components/ui/input';
import { cn } from '../../../../../internal/vendor-generated/assistant-ui/lib/utils.js';
import { SearchIcon, XIcon } from 'lucide-react';
import { forwardRef, useRef, type ComponentPropsWithoutRef } from 'react';

export const ThreadListSearch = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<typeof Input>, 'value' | 'onChange'> & {
    value: string;
    onValueChange: (value: string) => void;
    clearLabel?: string;
  }
>(({ className, value, onValueChange, clearLabel, ...props }, ref) => {
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <div data-agent-ui-owned='' data-slot='aui_thread-list-search' className='relative px-0.5 py-1'>
      <SearchIcon
        data-agent-ui-owned=''
        data-slot='aui_thread-list-search-icon'
        className='text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2'
      />
      <Input
        data-agent-ui-owned=''
        ref={(node) => {
          searchRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        type={clearLabel ? 'text' : 'search'}
        role={clearLabel ? 'searchbox' : undefined}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label='Search threads'
        placeholder='Search threads'
        className={cn('h-8 ps-8 text-sm', clearLabel && 'pe-9', className)}
        {...props}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (!event.defaultPrevented && clearLabel && value && event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onValueChange('');
          }
        }}
      />
      {clearLabel && value && (
        <Button
          type='button'
          variant='ghost'
          size='icon'
          data-slot='agent-ui-thread-search-clear'
          aria-label={clearLabel}
          className='absolute end-1 top-1/2 size-7 -translate-y-1/2'
          onClick={() => {
            onValueChange('');
            searchRef.current?.focus();
          }}
        >
          <XIcon className='size-3.5' />
        </Button>
      )}
    </div>
  );
});

ThreadListSearch.displayName = 'ThreadListSearch';
