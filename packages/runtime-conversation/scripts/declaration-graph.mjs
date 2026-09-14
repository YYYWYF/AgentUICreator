import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const moduleSpecifierPattern = /\b(?:from|import|require)\s*(?:\(\s*)?["']([^"']+)["']/gu;
const referencePathPattern = /<reference\s+path=["']([^"']+)["']/gu;

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function collectRelativeSpecifiers(source) {
  const specifiers = new Set();
  for (const pattern of [moduleSpecifierPattern, referencePathPattern]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier?.startsWith(".")) specifiers.add(specifier);
    }
  }
  return [...specifiers];
}

async function resolveDeclarationTarget(sourcePath, specifier, declarationRoot) {
  const unresolvedPath = path.resolve(path.dirname(sourcePath), specifier);
  const relativePath = path.relative(declarationRoot, unresolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return undefined;

  const candidates = [];
  if (/\.d\.(?:ts|mts|cts)$/u.test(unresolvedPath)) {
    candidates.push(unresolvedPath);
  } else if (/\.(?:m|c)?js$/u.test(unresolvedPath)) {
    candidates.push(unresolvedPath.replace(/\.(?:m|c)?js$/u, ".d.ts"));
  } else {
    candidates.push(
      `${unresolvedPath}.d.ts`,
      `${unresolvedPath}.d.mts`,
      `${unresolvedPath}.d.cts`,
      path.join(unresolvedPath, "index.d.ts"),
    );
  }

  for (const candidate of candidates) {
    if (await isFile(candidate)) return candidate;
  }
  return undefined;
}

export async function collectDeclarationFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) return collectDeclarationFiles(absolutePath);
    return entry.isFile() && /\.d\.(?:ts|mts|cts)$/u.test(entry.name)
      ? [absolutePath]
      : [];
  }));
  return files.flat();
}

export async function buildDeclarationGraph(declarationRoot, entryPath) {
  if (!(await isFile(entryPath))) {
    return {
      missing: [{ sourcePath: entryPath, specifier: "<entry declaration>" }],
      reachable: new Set(),
    };
  }

  const reachable = new Set();
  const missing = [];
  const pending = [entryPath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    if (currentPath === undefined || reachable.has(currentPath)) continue;
    reachable.add(currentPath);

    const source = await readFile(currentPath, "utf8");
    for (const specifier of collectRelativeSpecifiers(source)) {
      const target = await resolveDeclarationTarget(
        currentPath,
        specifier,
        declarationRoot,
      );
      if (target === undefined) missing.push({ sourcePath: currentPath, specifier });
      else if (!reachable.has(target)) pending.push(target);
    }
  }

  return { missing, reachable };
}
