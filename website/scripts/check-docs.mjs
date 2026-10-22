import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const website = fileURLToPath(new URL('../', import.meta.url));
const docs = path.join(website, 'docs');
const built = process.argv.includes('--built');
const logical = file => path.relative(docs, file).split(path.sep).join('/');
const read = file => readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

const pages = new Map(filesUnder(docs)
  .filter(file => /\.(md|mdx)$/u.test(file))
  .map(file => [logical(file), file]));

function resolvePage(route) {
  const stem = decodeURIComponent(route).replace(/^\//u, '').replace(/\.(html|md|mdx)$/u, '');
  return [`${stem}.md`, `${stem}.mdx`, path.posix.join(stem, 'index.md'), path.posix.join(stem, 'index.mdx')]
    .find(candidate => pages.has(candidate));
}

const destinations = new Map();
let maxDepth = 0;
function record(route, owner, depth) {
  assert(depth <= 1, `Navigation is deeper than a topic group and article: ${route}`);
  const page = resolvePage(route);
  assert(page, `Missing navigation target: ${route}`);
  assert(page.startsWith(`${owner}/`), `Wrong menu owner (${owner}): ${page}`);
  assert(!destinations.has(page), `Duplicate sidebar entry: ${page}`);
  destinations.set(page, owner);
  maxDepth = Math.max(maxDepth, depth);
}

function inspectMeta(items, directory, owner, depth = 0) {
  for (const item of items) {
    assert(typeof item === 'object', `Use explicit navigation metadata in ${directory}`);
    if (item.type === 'file') {
      record(`/${path.posix.join(directory, item.name)}`, owner, depth);
    } else if (item.type === 'dir') {
      const child = path.posix.join(directory, item.name);
      inspectMeta(json(path.join(docs, child, '_meta.json')), child, owner, depth + 1);
    } else if (item.type === 'custom-link' || (!item.type && (item.link || item.items))) {
      if (item.link) record(item.link, owner, depth);
      if (item.items) inspectMeta(item.items, directory, owner, depth + 1);
    } else {
      assert(['section-header', 'divider'].includes(item.type), `Unknown metadata type: ${item.type}`);
    }
  }
}

const owners = new Set();
function inspectNav(items) {
  for (const item of items) {
    if (item.link?.startsWith('/')) {
      const owner = item.link.split('/')[1];
      assert(!owners.has(owner), `Duplicate top-level topic: ${owner}`);
      owners.add(owner);
      inspectMeta(json(path.join(docs, owner, '_meta.json')), owner, owner);
    }
    if (item.items) inspectNav(item.items);
  }
}
inspectNav(json(path.join(docs, '_nav.json')));

const articles = [...pages.keys()].filter(page => page !== 'index.mdx');
assert.deepEqual(articles.filter(page => !destinations.has(page)), [], 'Articles missing from their menu');

let localLinks = 0;
for (const [name, file] of pages) {
  const source = read(file).replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gmu, '');
  for (const [, href] of source.matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/gu)) {
    if (!href.startsWith('.') && !href.startsWith('/') && !href.startsWith('#')) continue;
    const [target, anchor] = href.split(/#(.*)/su);
    const route = path.posix.normalize(target.startsWith('/')
      ? target.slice(1)
      : path.posix.join(path.posix.dirname(name), target || path.posix.basename(name)));
    const page = resolvePage(route);
    const resource = [path.join(docs, 'public', route), path.join(website, 'public', route), path.join(docs, route)]
      .some(candidate => existsSync(candidate));
    assert(page || resource, `${name}: missing link ${href}`);
    if (built && page && anchor) {
      const output = path.join(website, 'doc_build', page.replace(/\.(md|mdx)$/u, '.html'));
      assert(read(output).includes(`id="${decodeURIComponent(anchor)}"`), `${name}: missing anchor ${href}`);
    }
    localLinks++;
  }
  if (built) {
    const output = path.join(website, 'doc_build', name.replace(/\.(md|mdx)$/u, '.html'));
    assert(existsSync(output), `Missing built page: ${name}`);
    if (destinations.has(name)) {
      const sidebar = read(output).match(/<aside class="rp-doc-layout__sidebar[\s\S]*?<\/aside>/u)?.[0];
      const href = `/${name.replace(/\.(md|mdx)$/u, '.html')}`;
      assert(sidebar?.includes(`href="${href}"`), `Article absent from built sidebar: ${name}`);
    }
  }
}

console.log(`Checked ${articles.length} articles in ${owners.size} menus: every article has one sidebar entry, ` +
  `maximum article depth ${maxDepth}, ${localLinks} local links${built ? ', built pages and anchors' : ''}.`);
