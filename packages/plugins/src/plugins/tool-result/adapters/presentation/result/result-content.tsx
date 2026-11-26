import { ToolFallbackResult, formatUnknownValue } from '../tool-content.js';
import {
  hasToolResultParts,
  type ToolResultPart,
  type ToolResultSource,
} from './content.js';
import { ResultMediaPart } from './result-media.js';
import { useResultSources } from './use-result-source.js';
import type {
  ToolResultContext,
  ToolTextResultView,
  ToolMediaResultView,
  ToolResultComponents,
} from '../render-types.js';

export interface ToolResultContentProps {
  result: unknown;
  components?: ToolResultComponents | undefined;
  resolveFile?: (
    source: Extract<ToolResultSource, { type: 'file' }>,
    options: { signal: AbortSignal },
  ) => string | Promise<string>;
}
const emptyParts: readonly ToolResultPart[] = [];

export function useToolResultPresentation(
  { result, resolveFile, components }: ToolResultContentProps,
  recognizeParts = true,
  plainView = <ToolFallbackResult result={result} />,
) {
  const parts =
    recognizeParts && hasToolResultParts(result) ? result : emptyParts;
  const describe = useResultSources(parts, resolveFile);
  const items: (ToolTextResultView | ToolMediaResultView)[] = parts.map(
    (part, index) => {
      if (part.type === 'text') {
        const defaultView = (
          <p
            data-agent-ui-owned=""
            className="m-0 whitespace-pre-wrap break-words text-sm"
          >
            {part.text}
          </p>
        );
        const Text = components?.Text;
        return {
          part,
          index,
          text: part.text,
          defaultView: Text ? (
            <Text
              value={part.text}
              text={part.text}
              part={part}
              index={index}
              defaultView={defaultView}
            />
          ) : (
            defaultView
          ),
        };
      }
      const media = { part, index, ...describe(part) };
      return {
        ...media,
        defaultView: <ResultMediaPart {...media} components={components} />,
      };
    },
  );
  const context: ToolResultContext = {
    kind: parts.length ? 'parts' : result === undefined ? 'none' : 'plain',
    value: result,
    text: result === undefined ? '' : formatUnknownValue(result, 2),
    parts: items,
  };
  const Text = components?.Text;
  const view =
    context.kind === 'none' ? null : context.kind === 'plain' ? (
      Text ? (
        <Text value={result} text={context.text} defaultView={plainView} />
      ) : (
        plainView
      )
    ) : (
      <div
        data-agent-ui-owned=""
        data-slot="tool-result-content"
        className="flex min-w-0 max-w-full flex-col gap-3"
      >
        {items.map((item) => (
          <div
            data-agent-ui-owned=""
            key={`${item.index}:${item.part.id ?? ''}`}
            data-slot="tool-result-part"
            data-content-type={item.part.type}
            className="min-w-0 max-w-full"
          >
            {item.defaultView}
          </div>
        ))}
      </div>
    );
  return { context, view };
}
export function ToolResultContent(props: ToolResultContentProps) {
  return useToolResultPresentation(props).view;
}
