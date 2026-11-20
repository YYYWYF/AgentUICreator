'use client';
import { useAui, useAuiState } from '@assistant-ui/react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '../../../../../internal/adapters-generated/assistant-ui/components/ui/input.js';

export function ThreadRename({ label, onDone }: { label: string; onDone: (restoreFocus: boolean) => void }) {
  const aui = useAui();
  const title = useAuiState((s) => s.threadListItem.title) ?? '';
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  useEffect(() => {
    inputRef.current?.select();
  }, []);
  const commit = (focus: boolean) => {
    if (settled.current) return;
    settled.current = true;
    const next = value.trim();
    if (!next || next === title) {
      onDone(focus);
      return;
    }
    Promise.resolve()
      .then(() => aui.threadListItem.rename(next))
      .then(
        () => onDone(focus),
        () => {
          settled.current = false;
          if (focus) inputRef.current?.focus();
        },
      );
  };
  return (
    <Input
      ref={inputRef}
      autoFocus
      data-slot='agent-ui-thread-rename-input'
      aria-label={label}
      value={value}
      className='h-7 min-w-0 flex-1 ps-2.5 pe-9 text-sm'
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => commit(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(true);
        }
        if (event.key === 'Escape' && !settled.current) {
          event.preventDefault();
          event.stopPropagation();
          settled.current = true;
          onDone(true);
        }
      }}
    />
  );
}
