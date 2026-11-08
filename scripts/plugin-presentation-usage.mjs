import ts from 'typescript-ui-audit';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const implementationFile = name => /(?:\.[cm]?[jt]sx?|\.css)$/u.test(name) && !/\.d\.[cm]?ts$/u.test(name);

/** Build-time navigation only. Never import this module from a browser entry. */
export function presentationReferences(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hooks = new Set(), scopes = new Map(), imports = [], references = [];
  const scopeOf = node => {
    while (node && !ts.isBlock(node) && !ts.isSourceFile(node) && !ts.isFunctionLike(node)) node = node.parent;
    return node;
  };
  const bind = (node, name, namespace) => {
    const scope = scopeOf(node.parent);
    if (!scopes.has(scope)) scopes.set(scope, new Map());
    scopes.get(scope).set(name, namespace);
  };
  const visit = (node, fn) => { fn(node); ts.forEachChild(node, child => visit(child, fn)); };
  visit(source, node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
      if (/(?:locale|plugin-support|composer-support)\.js$/u.test(node.moduleSpecifier.text) || node.moduleSpecifier.text.startsWith('@za38.03/agent-ui-')) {
        const named = node.importClause?.namedBindings;
        if (named && ts.isNamedImports(named)) for (const item of named.elements)
          if ((item.propertyName ?? item.name).text === 'useAgentUILocale') hooks.add(item.name.text);
      }
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
  });
  visit(source, node => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) {
      let namespace = null;
      const call = node.initializer;
      if (call && ts.isCallExpression(call) && ts.isIdentifier(call.expression) && hooks.has(call.expression.text)) {
        const arg = call.arguments[0];
        if (!arg || ts.isStringLiteral(arg)) namespace = arg?.text ?? '';
      }
      bind(node, node.name.text, namespace);
    }
  });
  const access = node => {
    if (ts.isIdentifier(node)) return [node.text];
    if (ts.isPropertyAccessExpression(node)) { const base = access(node.expression); return base && [...base, node.name.text]; }
    if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
      const base = access(node.expression); return base && [...base, node.argumentExpression.text];
    }
  };
  visit(source, node => {
    if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return;
    if ((ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) && node.parent.expression === node) return;
    const chain = access(node);
    if (!chain) return;
    let scope = scopeOf(node), namespace;
    while (scope) {
      const bindings = scopes.get(scope);
      if (bindings?.has(chain[0])) { namespace = bindings.get(chain[0]); break; }
      scope = scopeOf(scope.parent);
    }
    if (typeof namespace !== 'string') return;
    const key = [namespace, ...chain.slice(1)].filter(Boolean).join('.');
    if (key.split('.').length < 2) return;
    references.push({ key, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
  });
  return { imports, references };
}

export async function buildPresentationUsage(packageRoot) {
  const sources = new Map();
  async function walk(directory) {
    for (const item of (await readdir(path.join(packageRoot, ...directory.split('/')), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.posix.join(directory, item.name);
      if (item.isDirectory()) await walk(file);
      else if (item.isFile() && implementationFile(item.name)) sources.set(file, await readFile(path.join(packageRoot, ...file.split('/')), 'utf8'));
    }
  }
  await walk('src/plugins'); await walk('src/shared');
  for (const item of (await readdir(path.join(packageRoot, 'src'), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name)))
    if (item.isFile() && implementationFile(item.name)) sources.set('src/' + item.name, await readFile(path.join(packageRoot, 'src', item.name), 'utf8'));
  const files = [...sources].map(([file, text]) => {
    const { imports, references } = file.endsWith('.css') ? { imports: [], references: [] } : presentationReferences(file, text);
    const dependencies = imports.filter(specifier => specifier.startsWith('.')).flatMap(specifier => {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const stem = base.replace(/\.[cm]?js$/u, '');
      const resolved = [base, stem + '.ts', stem + '.tsx', stem + '/index.ts', stem + '/index.tsx'].find(candidate => sources.has(candidate));
      return resolved ? [resolved.replace(/^src\//u, 'sources/')] : [];
    });
    return { path: file.replace(/^src\//u, 'sources/'), sha256: createHash('sha256').update(text).digest('hex'),
      ...(file.startsWith('src/plugins/') ? { pluginId: file.split('/')[2] } : {}), dependencies: [...new Set(dependencies)].sort(), references };
  });
  return { schemaVersion: 1, coverage: 'partial-static-references',
    interpretation: 'Literal locale reads bound to useAgentUILocale and relative module dependencies in canonical package sources. Aliasing, dynamic access, external modules and runtime reachability are not fully analyzed. Absence is not proof of no other consumers. Paths are package snapshot references, not project read_file paths or takeover authority.', files };
}
