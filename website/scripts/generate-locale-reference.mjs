import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const documentPath = 'website/docs/development/locale-reference.md';
const startMarker = '<!-- locale-reference:start -->';
const endMarker = '<!-- locale-reference:end -->';

// Presentation grouping and visibility are maintained here. Keys and defaults come from the dictionaries.
// Internal experiments stay out of public documentation until their product scope is approved.
const unpublishedFields = new Set([
  'examples.durableRun',
  'examples.agentPlanActivityRefreshRecovery',
  'examples.productionBindingRefreshRecovery',
  'examples.runResumeMock',
  'examples.sendALongTaskAndRefreshAfter',
]);

const groups = [
  ['会话、欢迎内容与历史记录', ['agentIdentity', 'conversation', 'starterSuggestions', 'threadList', 'conversationQuote', 'quote', 'conversationFeedback', 'copyAction', 'transientMessages']],
  ['输入、附件与语音服务', ['composer', 'conversationTriggers', 'triggers', 'attachments', 'serviceAdapters', 'skills']],
  ['工具、任务与人工确认', ['toolPresentation', 'toolTimeline', 'toolResult', 'tasks', 'humanQuestion', 'questionOptions', 'frontendTools']],
  ['搜索与检索', ['searchTools', 'search']],
  ['图片、音视频与文件', ['images', 'media', 'files']],
  ['主题、语言与通用控件', ['theme', 'accessibility', 'layout', 'common']],
  ['登录与账号', ['auth']],
  ['运行状态与错误', ['thinkingIndicator', 'runtime']],
  ['示例与演示页面', ['examples', 'themeShowcase', 'composerTriggerDemo']],
];

async function readDictionary(root, locale, exportName, owner = "plugins") {
  const filename = path.join(root, 'packages', owner, 'src', 'locales', `${locale}.ts`);
  const source = ts.createSourceFile(filename, await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  assert.equal(source.parseDiagnostics.length, 0, `${locale}: invalid TypeScript dictionary`);
  const declaration = source.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(node => ts.isIdentifier(node.name) && node.name.text === exportName);
  assert(declaration?.initializer, `${locale}: missing ${exportName}`);

  const runtime = owner === "plugins" ? await readDictionary(root, locale, exportName, "runtime") : undefined;
  function readObject(node) {
    assert(ts.isObjectLiteralExpression(node), `${locale}: expected a literal dictionary object`);
    const result = Object.create(null);
    for (const property of node.properties) {
      if(ts.isSpreadAssignment(property)){assert.equal(property.expression.getText(source),`AGENT_UI_RUNTIME_LOCALES["${locale}"]`);assert(runtime);Object.assign(result,runtime);continue;}
      assert(ts.isPropertyAssignment(property)
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)), `${locale}: unsupported dictionary property`);
      const key = property.name.text;
      assert(!Object.hasOwn(result, key), `${locale}: duplicate key ${key}`);
      const value = property.initializer;
      result[key] = ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
        ? value.text : readObject(value);
    }
    return result;
  }
  return readObject(declaration.initializer);
}

// HTML entities protect MDX expressions, table delimiters and literal Markdown characters.
function defaultCell(value) {
  const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;', '|': '&#124;', '`': '&#96;', '\\': '&#92;' };
  return `<code>${JSON.stringify(value).replace(/[&<>{}|`\\]/gu, char => escapes[char])}</code>`;
}

export function renderLocaleReference(english, chinese) {
  const namespaces = groups.flatMap(([, names]) => names);
  assert.equal(new Set(namespaces).size, namespaces.length, 'Duplicate locale reference group');
  assert.deepEqual(Object.keys(english).sort(), [...namespaces].sort(), 'Update functional groups for the dictionary namespaces');
  assert.deepEqual(Object.keys(chinese).sort(), [...namespaces].sort(), 'Locale namespace mismatch');
  let fields = 0;
  const sections = groups.map(([title, names]) => {
    const rows = names.flatMap(namespace => {
      const en = english[namespace], zh = chinese[namespace];
      assert(en && typeof en === 'object' && zh && typeof zh === 'object', `Invalid namespace: ${namespace}`);
      assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), `Locale key mismatch: ${namespace}`);
      return Object.keys(en).filter(key => !unpublishedFields.has(`${namespace}.${key}`)).map(key => {
        assert.equal(typeof en[key], 'string', `Invalid English message: ${namespace}.${key}`);
        assert.equal(typeof zh[key], 'string', `Invalid Chinese message: ${namespace}.${key}`);
        fields++;
        return `| \`${namespace}.${key}\` | ${defaultCell(zh[key])} | ${defaultCell(en[key])} |`;
      });
    });
    const heading = title === '示例与演示页面' ? '##' : '###';
    return [`${heading} ${title}`, '', '| 字段路径 | 默认中文（zh-CN） | 默认英文（en-US） |', '| --- | --- | --- |', ...rows].join('\n');
  });
  return {
    namespaces: namespaces.length,
    fields,
    markdown: [
      `以下 ${namespaces.length} 个命名空间、${fields} 个字段从 Plugins 的中英文词典自动生成，按功能分组。字段路径相对于每种语言的覆盖对象，例如 \`composer.placeholder\` 对应 \`locales['zh-CN'].composer.placeholder\`。`,
      '默认值以字符串字面量展示，`""` 表示空字符串，`\\n` 表示换行；引号不属于文案。这里只列出 npm 的默认值，项目和 Host 的已有覆盖可能使实际显示不同。字段是否显示取决于启用的插件、组件和当前状态。',
      ...sections,
    ].join('\n\n'),
  };
}

export function replaceLocaleReference(source, markdown) {
  assert.equal(source.split(startMarker).length, 2, 'Expected one locale reference start marker');
  assert.equal(source.split(endMarker).length, 2, 'Expected one locale reference end marker');
  const start = source.indexOf(startMarker), end = source.indexOf(endMarker);
  assert(end > start, 'Locale reference markers are out of order');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const block = [startMarker, '', markdown, '', endMarker].join('\n').replace(/\n/gu, newline);
  return source.slice(0, start) + block + source.slice(end + endMarker.length);
}

export async function generateLocaleReference({ root = repositoryRoot, check = false } = {}) {
  const [english, chinese, source] = await Promise.all([
    readDictionary(root, 'en-US', 'enUS'),
    readDictionary(root, 'zh-CN', 'zhCN'),
    readFile(path.join(root, documentPath), 'utf8'),
  ]);
  const reference = renderLocaleReference(english, chinese);
  const next = replaceLocaleReference(source, reference.markdown);
  if (check) {
    assert(next === source, 'Locale reference is out of date. Run pnpm docs:locales.');
  } else if (source !== next) {
    await writeFile(path.join(root, documentPath), next);
  }
  return { namespaces: reference.namespaces, fields: reference.fields };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  assert(process.argv.slice(2).every(argument => argument === '--check'), 'Usage: node website/scripts/generate-locale-reference.mjs [--check]');
  const check = process.argv.includes('--check');
  const result = await generateLocaleReference({ check });
  console.log(`Locale reference ${check ? 'checked' : 'generated'}: ${result.namespaces} namespaces, ${result.fields} fields.`);
}
