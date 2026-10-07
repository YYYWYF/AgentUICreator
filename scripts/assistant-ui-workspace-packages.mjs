import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const manifestFields = [...dependencyFields, "packages"];
const skippedDirectories = new Set([".git", "node_modules", ".pnpm-store", "dist", "build"]);

export async function packageFiles(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !skippedDirectories.has(entry.name)) {
        await visit(path.join(directory, entry.name));
      } else if (entry.isFile() && (entry.name === "package.json" || (entry.name === "item.json" && directory.startsWith(path.join(root, "packages/source-registry/registry/items"))))) {
        result.push(path.join(directory, entry.name));
      }
    }
  }
  await visit(root);
  return result.sort();
}

export function expectedDeclaration(field, declared, version, name) {
  if (name === "@assistant-ui/react-lexical" || name === "lexical" || name.startsWith("@lexical/")) return version;
  if (field !== "peerDependencies" || declared === version) return version;
  if (declared.startsWith("^") && /^\^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(declared)) return `^${version}`;
  if (declared.startsWith("~") && /^~\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(declared)) return `~${version}`;
  if (/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(declared)) return version;
  throw new Error(`Unsupported peer policy for ${name}: ${declared}. Use an exact version, ^version, or ~version.`);
}

export async function updatePackageManifests(root, packages) {
  const pending = [];
  for (const file of await packageFiles(root)) {
    const manifest = JSON.parse(await readFile(file, "utf8"));
    let modified = false;
    for (const field of manifestFields) {
      for (const [name, version] of Object.entries(packages)) {
        const declared = manifest[field]?.[name];
        if (declared === undefined) continue;
        const expected = expectedDeclaration(field, declared, version, name);
        if (declared !== expected) {
          manifest[field][name] = expected;
          modified = true;
        }
      }
    }
    if (modified) {
      pending.push({ file, content: `${JSON.stringify(manifest, null, 2)}\n` });
    }
  }
  for (const { file, content } of pending) await writeFile(file, content, "utf8");
  return pending.map(({ file }) => path.relative(root, file));
}

export async function packageManifestMismatches(root, packages) {
  const mismatches = [];
  for (const file of await packageFiles(root)) {
    const manifest = JSON.parse(await readFile(file, "utf8"));
    for (const field of manifestFields) {
      for (const [name, version] of Object.entries(packages)) {
        const declared = manifest[field]?.[name];
        if (declared === undefined) continue;
        let expected;
        try {
          expected = expectedDeclaration(field, declared, version, name);
        } catch (error) {
          mismatches.push(`${path.relative(root, file)} ${error.message}`);
          continue;
        }
        if (declared !== expected) {
          mismatches.push(`${path.relative(root, file)} ${field} declares ${name}=${declared}; expected ${expected}`);
        }
      }
    }
  }
  return mismatches;
}
