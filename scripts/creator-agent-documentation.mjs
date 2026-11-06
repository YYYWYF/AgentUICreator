import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';

export const referenceManifest = 'packages/creator/contracts/documentation/references.json';
export const agentIndexPath = 'agent-index.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Paths in the catalog are portable identifiers, never native absolute paths.
export function documentationPath(root, name) {
  assert(typeof name === 'string' && name && !/[\\:?#]/u.test(name) && !name.startsWith('/'), 'Invalid documentation path');
  assert(name.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid documentation path');
  return path.join(root, ...name.split('/'));
}

export async function referenceDocuments(root) {
  const config = JSON.parse(await readFile(documentationPath(root, referenceManifest), 'utf8'));
  assert.equal(config.schemaVersion, 1);
  assert(Array.isArray(config.documents));
  const names = new Set();
  for (const document of config.documents) {
    documentationPath(root, document.path);
    assert((document.path.startsWith('docs/') || document.path.startsWith('packages/creator/docs/')) && document.path.endsWith('.md'), 'Expected canonical docs reference');
    assert(!names.has(document.path) && document.topic && document.summary, 'Invalid or duplicate reference');
    names.add(document.path);
    // Refuse symlinked parents as well as symlinked source files.
    let current = root;
    for (const part of document.path.split('/')) {
      current = path.join(current, part);
      assert(!(await lstat(current)).isSymbolicLink(), 'Documentation references must not contain symlinks');
    }
  }
  return config.documents;
}

// ATX headings outside fenced code. Offsets refer to the exact packaged text.
export function documentationSections(text) {
  const headings = [];
  let offset = 0, fence;
  for (const [line, value] of text.split('\n').entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(value.replace(/\r$/u, ''));
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    } else if (!fence) {
      const heading = /^ {0,3}(#{1,6})[\t ]+(.+?)\s*$/u.exec(value);
      if (heading) headings.push({ id: `s${line + 1}`, title: heading[2].replace(/[\t ]+#+[\t ]*$/u, ''), level: heading[1].length, start: offset });
    }
    offset += value.length + 1;
  }
  if (!headings.length || headings[0].start > 0) headings.unshift({ id: 'intro', title: 'Introduction', level: 0, start: 0 });
  return headings.map((heading, i) => ({ ...heading, end: heading.id === 'intro' ? headings[i + 1]?.start ?? text.length : headings.slice(i + 1).find(next => next.level <= heading.level)?.start ?? text.length }));
}

export function portableReferenceLinks(text, origin, targets) {
  return text.replace(/(\]\()([^\s)]+)(\))/gu, (match, before, href, after) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(href)) return match;
    const [file, ...fragment] = href.split('#');
    const source = path.posix.normalize(path.posix.join(path.posix.dirname(origin), file));
    const target = source.startsWith('website/docs/') ? source.slice('website/docs/'.length).replace(/\.mdx$/u, '.md') : `references/${source}`;
    if (!targets.has(target)) return match;
    const relative = path.posix.relative(path.posix.dirname(`references/${origin}`), target);
    return `${before}${relative}${fragment.length ? `#${fragment.join('#')}` : ''}${after}`;
  });
}

export async function buildAgentDocumentation(root, directory) {
  const documents = [], seen = new Set();
  async function add(document) {
    assert(!seen.has(document.path), `Duplicate documentation entry: ${document.path}`);
    seen.add(document.path);
    const bytes = await readFile(documentationPath(directory, document.path));
    const text = bytes.toString('utf8'), sections = documentationSections(text);
    documents.push({ ...document, title: document.title || sections.find(section => section.level === 1)?.title || sections[0].title,
      sha256: hash(bytes), sections });
  }
  let topic = '公开文档';
  const llms = await readFile(path.join(directory, 'llms.txt'), 'utf8');
  for (const line of llms.split(/\r?\n/u)) {
    if (line.startsWith('## ')) topic = line.slice(3).trim();
    const link = /^- \[(.+)\]\(([^)]+)\)(?::\s*(.*))?$/u.exec(line);
    if (!link) continue;
    const name = link[2].replace(/^\//u, '');
    assert(name.endsWith('.md'), `Expected local Markdown in llms.txt: ${name}`);
    await add({ id: `public:${name.slice(0, -3)}`, source: 'public', topic, path: name, title: link[1], summary: (link[3] || '').slice(0, 300) });
  }
  assert(documents.length, 'llms.txt has no document links');
  const references = await referenceDocuments(root);
  const targets = new Set([...documents.map(document => document.path), ...references.map(reference => `references/${reference.path}`)]);
  for (const reference of references) {
    const name = `references/${reference.path}`;
    const target = documentationPath(directory, name);
    await mkdir(path.dirname(target), { recursive: true });
    const text = await readFile(documentationPath(root, reference.path), 'utf8');
    await writeFile(target, portableReferenceLinks(text, reference.path, targets));
    await add({ id: `internal:${reference.path.replace(/^docs\//u, '').slice(0, -3)}`, source: 'internal', ...reference, path: name });
  }
  const index = { schemaVersion: 1, documents };
  await writeFile(path.join(directory, agentIndexPath), `${JSON.stringify(index, null, 2)}\n`);
  const navigation = ['# Creator 文档索引', '', '公开文档目录：[llms.txt](llms.txt)。以下是当前 Creator 内部参考，按任务查阅；接口仍以目标工程实际安装版本为准。', ''];
  for (const topic of new Set(documents.filter(document => document.source === 'internal').map(document => document.topic))) {
    navigation.push(`## ${topic}`, '');
    for (const document of documents.filter(document => document.source === 'internal' && document.topic === topic)) navigation.push(`- [${document.title}](${document.path})：${document.summary}`);
    navigation.push('');
  }
  await writeFile(path.join(directory, 'creator-index.md'), `${navigation.join('\n')}\n`);
  return index;
}
