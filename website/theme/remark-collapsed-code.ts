function hasChildren(value: unknown): value is { children: unknown[] } {
  return typeof value === 'object' && value !== null &&
    'children' in value && Array.isArray(value.children);
}

function isCode(value: unknown): value is { type: 'code'; lang?: string | null; value: string } {
  return typeof value === 'object' && value !== null &&
    'type' in value && value.type === 'code' &&
    'value' in value && typeof value.value === 'string';
}

function isEventStream(code: { lang?: string | null; value: string }): boolean {
  const language = code.lang?.split(/\s/u)[0]?.toLowerCase();
  if (language === 'jsonl' || language === 'sse') return true;
  return [undefined, 'json', 'text', 'plaintext'].includes(language) &&
    /"type"\s*:\s*"(?:CUSTOM|RAW|(?:RUN|TEXT_MESSAGE|TOOL_CALL|REASONING|STATE|ACTIVITY|MESSAGES|STEP|SUBAGENT)_[A-Z_]+)"/u.test(code.value);
}

function isDisclosure(value: unknown): boolean {
  return typeof value === 'object' && value !== null &&
    'type' in value && value.type === 'mdxJsxFlowElement' &&
    'name' in value && value.name === 'details';
}

/** Native disclosures also work before hydration and in the static website. */
export function remarkCollapsedCode() {
  return (tree: unknown): void => {
    function visit(parent: { children: unknown[] }, insideDisclosure: boolean): void {
      parent.children = parent.children.map(child => {
        if (isCode(child) && !insideDisclosure) {
          if (isEventStream(child)) return child;
          const language = child.lang?.split(/\s/u)[0]?.toUpperCase();
          return {
            type: 'mdxJsxFlowElement',
            name: 'details',
            attributes: [{ type: 'mdxJsxAttribute', name: 'className', value: 'doc-code' }],
            children: [
              {
                type: 'mdxJsxFlowElement',
                name: 'summary',
                attributes: [],
                children: [{ type: 'text', value: language ? `查看代码 · ${language}` : '查看代码' }],
              },
              child,
            ],
          };
        }
        if (hasChildren(child)) visit(child, insideDisclosure || isDisclosure(child));
        return child;
      });
    }
    if (hasChildren(tree)) visit(tree, false);
  };
}
