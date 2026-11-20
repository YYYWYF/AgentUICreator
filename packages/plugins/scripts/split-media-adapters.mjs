import path from "node:path";
import ts from "typescript-ui-audit";

const elementRoot = "components/assistant-ui/elements/";
const recipes = {
  "image.tsx": {
    "image/data.ts": ["extensionForMimeType", "dataUriToBlob", "mimeFromImage", "defaultFilenameFromImage"],
    "image/download.ts": ["safeImageDownloadHref", "downloadImagePart"],
    "image/copy.ts": ["copyImagePart"],
    "image/root.tsx": ["imageVariants", "ImageRootProps", "ImageRoot"],
    "image/preview.tsx": ["ImagePreviewProps", "ImagePreview"],
    "image/source.tsx": ["ImageSourceProps", "ImageSource", "ImageFilename"],
    "image/zoom.tsx": ["ImageZoomProps", "ImageZoom"],
    "image/status.tsx": ["ImageGenerating", "ImageContentFilterError"],
    "image/actions.tsx": ["ImageActionsProps", "RegenerateButton", "ImageActions"],
  },
  "file.tsx": {
    "file/source.ts": ["FileDataKind", "getFileDataKind", "isUnsafeScheme", "getFileHref"],
    "file/size.ts": ["getBase64PayloadSize", "getBase64Size", "getDataUrlSize", "formatFileSize"],
    "file/appearance.tsx": ["fileVariants", "getMimeTypeIcon", "FileRootProps", "FileRoot", "FileIconDisplayProps", "FileIconDisplay", "FileName", "FileSizeProps", "FileSize"],
    "file/download.tsx": ["FileDownloadProps", "FileDownload"],
    "file/player.tsx": ["FilePlayerProps", "FilePlayer"],
  },
};

const declarationNames = node => ts.isVariableStatement(node)
  ? node.declarationList.declarations.map(declaration => declaration.name.getText())
  : node.name ? [node.name.text] : [];
const isType = node => ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node);

/** Split the reviewed product adaptation only; clean upstream remains untouched.
 * All module identifiers are logical POSIX paths on every build host. */
export function splitMediaAdapter(localPath, text) {
  const recipe = localPath.startsWith(elementRoot) && recipes[localPath.slice(elementRoot.length)];
  if (!recipe) return [{ localPath, source: text }];
  const source = ts.createSourceFile(localPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const host = {
    getSourceFile: name => name === localPath ? source : undefined,
    getDefaultLibFileName: () => "", writeFile() {}, getCurrentDirectory: () => "",
    getDirectories: () => [], fileExists: name => name === localPath,
    readFile: name => name === localPath ? text : undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
  };
  const checker = ts.createProgram([localPath], { noResolve: true, noLib: true, jsx: ts.JsxEmit.ReactJSX }, host).getTypeChecker();
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const print = node => printer.printNode(ts.EmitHint.Unspecified, node, source);
  const owner = new Map(), declarations = new Map();
  const expected = new Map(Object.entries(recipe).flatMap(([file, names]) => names.map(name => [name, elementRoot + file])));
  for (const statement of source.statements) {
    const names = declarationNames(statement);
    const target = names.map(name => expected.get(name)).find(Boolean) ?? localPath;
    owner.set(statement, target);
    for (const name of names) declarations.set(name, statement);
  }
  for (const name of expected.keys()) {
    if (!declarations.has(name)) throw new Error(`Media presentation split anchor changed: ${localPath}: ${name}`);
  }
  const topLevel = node => {
    while (node?.parent && node.parent !== source) node = node.parent;
    return node;
  };
  const relative = (from, to) => {
    const value = path.posix.relative(path.posix.dirname(from), to).replace(/\.tsx?$/u, ".js");
    return value.startsWith(".") ? value : "./" + value;
  };
  const modules = [localPath, ...Object.keys(recipe).map(file => elementRoot + file)];
  return modules.map(target => {
    const statements = source.statements.filter(node => !ts.isImportDeclaration(node) && owner.get(node) === target);
    const usedImports = new Set(), dependencies = new Map();
    const depend = (name, declaration) => {
      const destination = owner.get(declaration);
      if (!destination || destination === target) return;
      const names = dependencies.get(destination) ?? new Map();
      names.set(name, isType(declaration));
      dependencies.set(destination, names);
    };
    const visit = node => {
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        for (const declaration of symbol?.declarations ?? []) {
          const top = topLevel(declaration);
          if (ts.isImportDeclaration(top)) usedImports.add(symbol);
          else depend(node.text, top);
        }
        if (ts.isExportSpecifier(node.parent)) {
          const name = (node.parent.propertyName ?? node.parent.name).text;
          depend(name, declarations.get(name));
        }
      }
      ts.forEachChild(node, visit);
    };
    statements.forEach(visit);
    const imports = [];
    for (const statement of source.statements.filter(ts.isImportDeclaration)) {
      const clause = statement.importClause;
      if (!clause) { imports.push(statement.getText(source)); continue; }
      const used = name => name && usedImports.has(checker.getSymbolAtLocation(name));
      const named = clause.namedBindings;
      const retained = named && (ts.isNamedImports(named)
        ? ts.factory.updateNamedImports(named, named.elements.filter(item => used(item.name)))
        : used(named.name) ? named : undefined);
      const defaultName = used(clause.name) ? clause.name : undefined;
      if (!defaultName && (!retained || ts.isNamedImports(retained) && !retained.elements.length)) continue;
      const specifier = statement.moduleSpecifier.text;
      const next = specifier.startsWith(".") && target !== localPath
        ? relative(target, path.posix.normalize(path.posix.join(path.posix.dirname(localPath), specifier))) : specifier;
      imports.push(print(ts.factory.updateImportDeclaration(statement, statement.modifiers,
        ts.factory.updateImportClause(clause, clause.isTypeOnly, defaultName, retained),
        ts.factory.createStringLiteral(next), statement.attributes)));
    }
    for (const [file, names] of dependencies) {
      imports.push(`import { ${[...names].map(([name, type]) => (type ? "type " : "") + name).join(", ")} } from ${JSON.stringify(relative(target, file))};`);
    }
    const body = statements.filter(node => !ts.isExpressionStatement(node) || !ts.isStringLiteral(node.expression)).map(node => {
      const exported = node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
      return (target !== localPath && !exported ? "export " : "") + node.getText(source);
    });
    if (target === localPath) {
      for (const [name, declaration] of declarations) {
        if (owner.get(declaration) === localPath || !declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
        body.push(`export ${isType(declaration) ? "type " : ""}{ ${name} } from ${JSON.stringify(relative(target, owner.get(declaration)))};`);
      }
    }
    return { localPath: target, source: `'use client';\n\n${imports.join("\n")}\n\n${body.join("\n\n")}\n` };
  });
}
