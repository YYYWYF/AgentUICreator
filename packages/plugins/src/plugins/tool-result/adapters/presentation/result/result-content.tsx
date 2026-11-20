import type { ReactNode } from 'react';
import { ToolFallbackResult } from '../tool-content.js';
import { hasToolResultParts, type ToolResultPart, type ToolResultSource } from './content.js';
import { ResultMediaPart } from './result-media.js';
export interface ToolResultContentProps {
  result: unknown;
  resolveFile?: (
    source: Extract<ToolResultSource, { type: 'file' }>,
    options: { signal: AbortSignal },
  ) => string | Promise<string>;
  renderPart?: (part: ToolResultPart, index: number, defaultContent: ReactNode) => ReactNode;
}

export function ToolResultContent({ result, resolveFile, renderPart }: ToolResultContentProps) {
  if (!hasToolResultParts(result)) {
    return <ToolFallbackResult result={result} />;
  }
  return (
    <div data-agent-ui-owned='' data-slot='tool-result-content' className='flex min-w-0 max-w-full flex-col gap-3'>
      {result.map((part, index) => {
        const content =
          part.type === 'text' ? (
            <p data-agent-ui-owned='' className='m-0 whitespace-pre-wrap break-words text-sm'>
              {part.text}
            </p>
          ) : (
            <ResultMediaPart part={part} {...(resolveFile ? { resolveFile } : {})} />
          );
        return (
          <div
            data-agent-ui-owned=''
            key={`${index}:${part.id ?? ''}`}
            data-slot='tool-result-part'
            data-content-type={part.type}
            className='min-w-0 max-w-full'
          >
            {renderPart ? renderPart(part, index, content) : content}
          </div>
        );
      })}
    </div>
  );
}
