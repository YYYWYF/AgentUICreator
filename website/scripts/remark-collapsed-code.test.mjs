import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transpileModule, ModuleKind } = require('typescript');
const source = readFileSync(new URL('../theme/remark-collapsed-code.ts', import.meta.url), 'utf8');
const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext } });
const { remarkCollapsedCode } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('AG-UI events and marked protocol payloads remain plain code blocks', () => {
  const examples = [
    { type: 'code', lang: 'jsonl', value: '{"type":"RUN_STARTED"}' },
    { type: 'code', lang: 'sse', value: 'data: {"type":"RUN_FINISHED"}\r\n\r\n' },
    { type: 'code', lang: 'json', value: '{\n  "type": "CUSTOM", "name": "chart"\n}' },
    { type: 'code', lang: 'json', meta: 'ag-ui', value: '{"answers":{"layout":["dashboard"]}}' },
    { type: 'code', lang: 'json', meta: 'title="Request" ag-ui', value: '{"resume":[]}' },
  ];
  const tree = { children: [...examples] };
  remarkCollapsedCode()(tree);
  examples.forEach((example, index) => assert.equal(tree.children[index], example));
});

test('React examples and unrelated configuration retain their existing disclosure', () => {
  const examples = [
    { type: 'code', lang: 'tsx', value: 'export function Example() { return null; }' },
    { type: 'code', lang: 'json', value: '{"pluginId":"composer"}' },
  ];
  const tree = { children: [...examples] };
  remarkCollapsedCode()(tree);
  tree.children.forEach((node, index) => {
    assert.equal(node.name, 'details');
    assert.equal(node.attributes.some(attribute => attribute.name === 'open'), false);
    assert.equal(node.children[1], examples[index]);
  });
});
