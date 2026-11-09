import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { finalizeShadowStyles } from '../packages/plugins/resources/registry/items/integration/web-component-bridge/files/integrations/web-component-bridge/build-styles.mjs';

test('inlines nested emitted CSS into every standalone format and removes only CSS assets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'shadow css 中文 '));
  try {
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'assets/theme.css'), '.theme { color: red; }');
    await writeFile(path.join(root, 'entry.css'), '.root { display: block; }');
    await writeFile(path.join(root, 'assets/keep.svg'), '<svg/>');
    for (const name of ['agent-ui.js', 'agent-ui.es.js']) {
      await writeFile(path.join(root, name), 'export const css = "__AGENT_UI_BUNDLED_PLUGIN_CSS__";');
    }
    await finalizeShadowStyles(root, ['agent-ui.js', 'agent-ui.es.js']);
    for (const name of ['agent-ui.js', 'agent-ui.es.js']) {
      const source = await readFile(path.join(root, name), 'utf8');
      assert(source.includes('.theme') && source.includes('.root'));
      assert(!source.includes('__AGENT_UI_BUNDLED_PLUGIN_CSS__'));
    }
    await assert.rejects(access(path.join(root, 'entry.css')), { code: 'ENOENT' });
    await assert.rejects(access(path.join(root, 'assets/theme.css')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(root, 'assets/keep.svg'), 'utf8'), '<svg/>');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('validates all output markers and Windows/relative paths before mutating assets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'shadow failure '));
  try {
    const original = 'export const css = "__AGENT_UI_BUNDLED_PLUGIN_CSS__";';
    await writeFile(path.join(root, 'entry.css'), '.root {}');
    await writeFile(path.join(root, 'agent-ui.js'), original);
    await writeFile(path.join(root, 'missing.js'), 'export const css = "";');
    await assert.rejects(finalizeShadowStyles(root, ['agent-ui.js', 'missing.js']), /MARKER_MISSING/);
    for (const script of ['C:/outside.js', 'C:\\outside.js', '../outside.js', '/outside.js']) {
      await assert.rejects(finalizeShadowStyles(root, [script]), /SCRIPT_PATH_INVALID/);
    }
    assert.equal(await readFile(path.join(root, 'agent-ui.js'), 'utf8'), original);
    assert.equal(await readFile(path.join(root, 'entry.css'), 'utf8'), '.root {}');
  } finally { await rm(root, { recursive: true, force: true }); }
});
