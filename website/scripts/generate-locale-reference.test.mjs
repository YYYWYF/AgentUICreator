import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { generateLocaleReference, replaceLocaleReference } from './generate-locale-reference.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const dictionaries = path.join('packages', 'plugins', 'src', 'locales');
const document = path.join('website', 'docs', 'development', 'styling-and-localization.md');

async function fixture(t, newline = '\n') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'locale reference 文案 '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, dictionaries), { recursive: true });
  await mkdir(path.join(root, 'packages/runtime/src/locales'), { recursive: true });
  await mkdir(path.dirname(path.join(root, document)), { recursive: true });
  const messages = {};
  for (const [locale, name] of [['en-US', 'enUS'], ['zh-CN', 'zhCN']]) {
    // Independently load the real dictionaries to verify extraction from their TypeScript source.
    const source = await readFile(path.join(repositoryRoot, dictionaries, `${locale}.ts`), 'utf8');
    const runtimeSource = await readFile(path.join(repositoryRoot, 'packages/runtime/src/locales', `${locale}.ts`), 'utf8');
    await writeFile(path.join(root, 'packages/runtime/src/locales', `${locale}.ts`), runtimeSource);
    const runtimeExports = {};
    vm.runInNewContext(ts.transpileModule(runtimeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: runtimeExports });
    const exports = {};
    const require = specifier => {
      assert.equal(specifier, '@za38.03/agent-ui-runtime/locale');
      return { AGENT_UI_RUNTIME_LOCALES: { [locale]: runtimeExports[name] } };
    };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require });
    messages[locale] = JSON.parse(JSON.stringify(exports[name]));
  }
  await writeFile(path.join(root, document), [
    '用户维护的开头', '<!-- locale-reference:start -->', '过期清单',
    '<!-- locale-reference:end -->', '用户维护的结尾', '',
  ].join(newline));
  async function save() {
    for (const [locale, name] of [['en-US', 'enUS'], ['zh-CN', 'zhCN']]) {
      await writeFile(path.join(root, dictionaries, `${locale}.ts`),
        `export const ${name} = ${JSON.stringify(messages[locale], null, 2)};\n`.replace(/\n/gu, newline));
    }
  }
  await save();
  return { root, messages, save, read: () => readFile(path.join(root, document), 'utf8') };
}

test('includes every public field exactly once and preserves manually maintained prose', async t => {
  const f = await fixture(t);
  await generateLocaleReference({ root: f.root });
  const generated = await f.read();
  const expected = Object.entries(f.messages['en-US']).flatMap(([namespace, values]) => Object.keys(values).map(key => `${namespace}.${key}`));
  const actual = [...generated.matchAll(/^\| `([^`]+)` \|/gmu)].map(match => match[1]);
  assert.deepEqual(actual.sort(), expected.sort());
  assert(generated.startsWith('用户维护的开头\n'));
  assert(generated.endsWith('用户维护的结尾\n'));
  assert.match(generated, /### 会话、欢迎内容与历史记录/u);
  assert.match(generated, /### 示例与演示页面/u);
  await generateLocaleReference({ root: f.root, check: true });
});

test('detects changed defaults, additions and removals without writing in check mode', async t => {
  const f = await fixture(t);
  await generateLocaleReference({ root: f.root });
  const before = await f.read();
  f.messages['en-US'].composer.placeholder = 'A changed prompt';
  f.messages['zh-CN'].composer.placeholder = '修改后的提示';
  for (const locale of ['en-US', 'zh-CN']) {
    f.messages[locale].composer.newLabel = 'New label';
    delete f.messages[locale].composer.send;
  }
  await f.save();
  await assert.rejects(generateLocaleReference({ root: f.root, check: true }), /pnpm docs:locales/u);
  assert.equal(await f.read(), before);
  await generateLocaleReference({ root: f.root });
  const after = await f.read();
  assert.match(after, /A changed prompt/u);
  assert.match(after, /composer.newLabel/u);
  assert.doesNotMatch(after, /`composer.send`/u);
  await generateLocaleReference({ root: f.root, check: true });
});

test('fails on missing translations or ungrouped namespaces before changing documentation', async t => {
  const f = await fixture(t);
  const before = await f.read();
  delete f.messages['zh-CN'].composer.send;
  await f.save();
  await assert.rejects(generateLocaleReference({ root: f.root }), /Locale key mismatch: composer/u);
  for (const locale of ['en-US', 'zh-CN']) f.messages[locale].newDomain = { label: 'New domain' };
  await f.save();
  await assert.rejects(generateLocaleReference({ root: f.root }), /Update functional groups/u);
  assert.equal(await f.read(), before);
});

test('escapes Markdown and MDX text, preserves empty defaults, CRLF and unchanged files', async t => {
  const f = await fixture(t, '\r\n');
  for (const locale of ['en-US', 'zh-CN']) {
    f.messages[locale].common.escapeFixture = '"quoted" {count} <button>& x|y `code` \\file\nnext';
  }
  await f.save();
  await generateLocaleReference({ root: f.root });
  const generated = await f.read();
  assert.match(generated, /&#123;count&#125; &lt;button&gt;&amp; x&#124;y &#96;code&#96; &#92;&#92;file&#92;nnext/u);
  assert.match(generated, /`conversation.welcomeDescription` \| <code>""<\/code> \| <code>""<\/code>/u);
  assert(!/(?<!\r)\n/u.test(generated), 'CRLF source documents must keep their line endings');
  const before = await stat(path.join(f.root, document));
  await generateLocaleReference({ root: f.root });
  await generateLocaleReference({ root: f.root, check: true });
  assert.equal((await stat(path.join(f.root, document))).mtimeMs, before.mtimeMs);
});

test('rejects ambiguous generation markers', () => {
  assert.throws(() => replaceLocaleReference('no markers', 'new'), /start marker/u);
  assert.throws(() => replaceLocaleReference('<!-- locale-reference:start -->\n<!-- locale-reference:start -->\n<!-- locale-reference:end -->', 'new'), /start marker/u);
  assert.throws(() => replaceLocaleReference('<!-- locale-reference:end -->\n<!-- locale-reference:start -->', 'new'), /out of order/u);
});

test('CLI locates repository files independently of the working directory', async t => {
  const f = await fixture(t);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./generate-locale-reference.mjs', import.meta.url)), '--check'], {
    cwd: f.root, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Locale reference checked:/u);
});
