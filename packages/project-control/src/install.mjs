import { access, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const MANAGED_CONTROL_ENTRY = ".agent-ui/control/project-control.mjs";
export const CONTROL_PROTOCOL_VERSION = 3;
export const CONTROL_RUNTIME_VERSION = 1;
const runtime = new URL("../dist/runtime/project-control-runtime.mjs", import.meta.url);

/** A control entry references the installed development tool, not Host source.
 * Creator ensures the entry before starting its runtime.
 */
export async function installManagedProjectControl(projectRoot, { upgrade = false } = {}) {
  await access(fileURLToPath(runtime));
  const entry = path.join(projectRoot, MANAGED_CONTROL_ENTRY);
  for (const directory of [path.join(projectRoot, ".agent-ui"), path.dirname(entry)]) {
    try {
      if ((await lstat(directory)).isSymbolicLink()) throw new Error("Control directory cannot be a symbolic link.");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await mkdir(path.dirname(entry), { recursive: true });
  const source = controlEntrySource(runtime.href);
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
  return [MANAGED_CONTROL_ENTRY];
}

function controlEntrySource(runtimeUrl, protocolVersion = CONTROL_PROTOCOL_VERSION, runtimeVersion = CONTROL_RUNTIME_VERSION) {
  return [
    "// Agent UI managed control plane; development only. Reinstall on tool upgrade.",
    `export const controlMetadata = { controlProtocolVersion: ${protocolVersion}, controlRuntimeVersion: ${runtimeVersion} };`,
    'import path from "node:path";',
    'import { fileURLToPath } from "node:url";',
    `import { runUIProjectControlCli } from ${JSON.stringify(runtimeUrl)};`,
    'await runUIProjectControlCli(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));',
    "",
  ].join("\n");
}

/** Validate the entire generated template without executing the old import. */
function assertManagedEntry(info, source) {
  const metadata = source.match(/export const controlMetadata = \{ controlProtocolVersion: (\d+), controlRuntimeVersion: (\d+) \};/);
  const runtimeImport = source.match(/import \{ runUIProjectControlCli \} from ("[^"\n]+");/);
  if (!info.isFile() || !metadata || !runtimeImport ||
      source !== controlEntrySource(JSON.parse(runtimeImport[1]), Number(metadata[1]), Number(metadata[2]))) {
    throw new Error("Refusing to replace an unmanaged or user-modified control entry.");
  }
  if (Number(metadata[1]) > CONTROL_PROTOCOL_VERSION || Number(metadata[2]) > CONTROL_RUNTIME_VERSION)
    throw new Error("Control entry requires a newer Creator runtime.");
}

export async function ensureManagedProjectControl(projectRoot, { managed = false } = {}) {
  const entry = path.join(projectRoot, MANAGED_CONTROL_ENTRY);
  let info;
  try { info = await lstat(entry); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    return managed ? installManagedProjectControl(projectRoot) : [];
  }
  const current = await readFile(entry, "utf8");
  assertManagedEntry(info, current);
  // Exact comparison includes the installed runtime URL, so relocation upgrades too.
  if (current === controlEntrySource(runtime.href)) {
    await access(fileURLToPath(runtime));
    return [];
  }
  return installManagedProjectControl(projectRoot, { upgrade: true });
}
