import { access, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const MANAGED_CONTROL_ENTRY = ".agent-ui/control/project-control.mjs";
export const CONTROL_PROTOCOL_VERSION = 3;
export const CONTROL_RUNTIME_VERSION = 1;
const runtime = new URL("../dist/runtime/project-control-runtime.mjs", import.meta.url);

/** A control entry references the installed development tool, not Host source.
 * Re-run the initializer/upgrade installer after relocating or upgrading the tool.
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
  const source = [
    "// Agent UI managed control plane; development only. Reinstall on tool upgrade.",
    `export const controlMetadata = { controlProtocolVersion: ${CONTROL_PROTOCOL_VERSION}, controlRuntimeVersion: ${CONTROL_RUNTIME_VERSION} };`,
    'import path from "node:path";',
    'import { fileURLToPath } from "node:url";',
    `import { runUIProjectControlCli } from ${JSON.stringify(runtime.href)};`,
    'await runUIProjectControlCli(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));',
    "",
  ].join("\n");
  if (upgrade) {
    const current = await readFile(entry, "utf8");
    if (!(await lstat(entry)).isFile() || !current.startsWith("// Agent UI managed control plane;"))
      throw new Error("Refusing to replace an unmanaged control entry.");
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
