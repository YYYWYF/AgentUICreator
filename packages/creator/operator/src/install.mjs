import { access, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const MANAGED_OPERATOR_ENTRY = ".agent-ui/operator/entry.mjs";
const runtime = new URL("../dist/runtime/operator-runtime.mjs", import.meta.url);

/** An Operator entry references the installed development tool, not Host source.
 * Creator ensures the entry before starting its runtime.
 */
export async function installManagedOperator(projectRoot, { upgrade = false } = {}) {
  await access(fileURLToPath(runtime));
  const entry = path.join(projectRoot, MANAGED_OPERATOR_ENTRY);
  for (const directory of [path.join(projectRoot, ".agent-ui"), path.dirname(entry)]) {
    try {
      if ((await lstat(directory)).isSymbolicLink()) throw new Error("Operator directory cannot be a symbolic link.");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await mkdir(path.dirname(entry), { recursive: true });
  const source = operatorEntrySource(runtime.href);
  if (upgrade) {
    const current = await readFile(entry, "utf8");
    assertManagedEntry(await lstat(entry), current);
    const temporary = `${entry}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, source, { flag: "wx" });
      await rename(temporary, entry);
    } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  } else {
    await writeFile(entry, source, { flag: "wx" });
  }
  return [MANAGED_OPERATOR_ENTRY];
}

function operatorEntrySource(runtimeUrl) {
  return [
    "// Agent UI managed Operator; development only. Reinstall on tool upgrade.",
    'import path from "node:path";',
    'import { fileURLToPath } from "node:url";',
    `import { runUIOperatorCli } from ${JSON.stringify(runtimeUrl)};`,
    'await runUIOperatorCli(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));',
    "",
  ].join("\n");
}

/** Validate the entire generated template without executing the old import. */
function assertManagedEntry(info, source) {
  const runtimeImport = source.match(/import \{ runUIOperatorCli \} from ("[^"\n]+");/);
  if (!info.isFile() || !runtimeImport ||
      source !== operatorEntrySource(JSON.parse(runtimeImport[1]))) {
    throw new Error("Refusing to replace an unmanaged or user-modified Operator entry.");
  }
}

export async function ensureManagedOperator(projectRoot) {
  const entry = path.join(projectRoot, MANAGED_OPERATOR_ENTRY);
  let info;
  try { info = await lstat(entry); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    return installManagedOperator(projectRoot);
  }
  const current = await readFile(entry, "utf8");
  assertManagedEntry(info, current);
  // Exact comparison includes the installed runtime URL, so relocation upgrades too.
  if (current === operatorEntrySource(runtime.href)) {
    await access(fileURLToPath(runtime));
    return [];
  }
  return installManagedOperator(projectRoot, { upgrade: true });
}
