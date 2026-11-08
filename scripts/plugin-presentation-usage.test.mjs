import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPresentationUsage, presentationReferences } from './plugin-presentation-usage.mjs';

test('extracts literal localized reads with aliases and lexical scope, not comments or unrelated objects', () => {
  const source = `import {useAgentUILocale as messages} from './locale.js';
  function A(){const text=messages();return text.common.save;}
  function B(){const text=messages('tasks');return text['cancel'];}
  function C(text){return text.common.wrong;}
  // text.common.comment
  const unrelated={common:{save:'x'}}; unrelated.common.save;
  function D(){const text=messages('tasks'); function nested(text){return text.wrong;} return text.done;}`;
  assert.deepEqual(presentationReferences('src/view.tsx', source).references.map(r => r.key), ['common.save', 'tasks.cancel', 'tasks.done']);
});
test('indexes independent plugins and shared readers with native disk paths and POSIX catalog paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'presentation 索引 '));
  try {
    for (const dir of ['src/plugins/alpha', 'src/plugins/beta', 'src/shared']) await mkdir(path.join(root, ...dir.split('/')), {recursive:true});
    const files = {
      'src/plugins/alpha/view.tsx': `import {useAgentUILocale} from '../../locale.js'; import '../../shared/view.js'; import '../../shared/theme.css'; const m=useAgentUILocale(); m.common.save;`,
      'src/plugins/beta/view.tsx': `import {useAgentUILocale} from '../../locale.js'; const m=useAgentUILocale('tasks'); m.cancel;`,
      'src/shared/view.tsx': `import {useAgentUILocale} from '../locale.js'; const m=useAgentUILocale(); m.common.save;`,
      'src/shared/theme.css': 'button {color: red}', 'src/public.tsx': '',
    };
    for (const [file, text] of Object.entries(files)) await writeFile(path.join(root, ...file.split('/')), text);
    const index = await buildPresentationUsage(root);
    const alpha = index.files.find(f => f.pluginId === 'alpha');
    assert.deepEqual(alpha.dependencies, ['sources/shared/theme.css', 'sources/shared/view.tsx']);
    assert.equal(index.files.flatMap(f => f.references.filter(r => r.key === 'common.save')).length, 2);
    assert.equal(index.files.some(f => f.path.includes('\\')), false);
    assert.equal(index.coverage, 'partial-static-references');
    const oldHash = alpha.sha256;
    await writeFile(path.join(root, 'src/plugins/alpha/view.tsx'), files['src/plugins/alpha/view.tsx'].replace('common.save','common.close'));
    assert.notEqual((await buildPresentationUsage(root)).files.find(f => f.pluginId === 'alpha').sha256, oldHash);
  } finally { await rm(root, {recursive:true,force:true}); }
});
test('current catalog inputs expose shared copy consumers without a handwritten per-task mapping', async () => {
  const index = await buildPresentationUsage(fileURLToPath(new URL('../packages/plugins', import.meta.url)));
  const readers = index.files.filter(f => f.references.some(r => r.key === 'common.copy'));
  assert.ok(readers.some(f => f.pluginId === 'copy-action'));
  assert.ok(readers.some(f => f.path.includes('markdown-text')));
  assert.ok(index.files.some(f => f.pluginId === 'reload-action' && f.references.some(r => r.key === 'common.refresh')));
});
