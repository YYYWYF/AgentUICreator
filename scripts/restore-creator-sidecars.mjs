// Node-only release stage: restore artifacts from the separate Python build jobs.
import assert from "node:assert/strict";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { run } from "./creator-distribution-helpers.mjs";
import { sidecarRoot, sidecarPlatforms, verifySidecarPackage } from "../packages/creator/scripts/verify-sidecar-package.mjs";

export function parseRestoreArguments(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { all: { type: "boolean" } } });
  assert(positionals.length <= 1, "CREATOR_ARTIFACT_ARGUMENTS_INVALID");
  return {
    artifacts: path.resolve(positionals[0] ?? fileURLToPath(new URL("../packages/creator/platforms/dist/artifacts", import.meta.url))),
    required: values.all ? [...sidecarPlatforms] : [`${process.platform}-${process.arch}`],
  };
}

export async function restoreCreatorSidecars(args = process.argv.slice(2)) {
 const { artifacts, required } = parseRestoreArguments(args);
 for (const id of required) {
  const root = sidecarRoot(id);
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const filename = `${manifest.name.slice(1).replace("/", "-")}-${manifest.version}.tgz`;
  assert((await readdir(artifacts)).includes(filename), `Missing Python build artifact: ${filename}`);
  const temporary = await mkdtemp(path.join(tmpdir(), "creator-sidecar-restore-"));
  try {
    await run("tar", ["-xzf", path.join(artifacts, filename), "-C", temporary]);
    const extracted = path.join(temporary, "package");
    const packed = JSON.parse(await readFile(path.join(extracted, "package.json"), "utf8"));
    assert.deepEqual(packed, manifest, "Platform artifact package metadata changed; rebuild with this source revision");
    await verifySidecarPackage(extracted);
    await mkdir(root, { recursive: true });
    const nativeRoot = await realpath(root);
    assert.equal(path.relative(await realpath(path.dirname(root)), nativeRoot).toLowerCase(), id.toLowerCase(), "Platform package escapes sidecar workspace");
    const destination = path.resolve(nativeRoot, "dist");
    try { assert(!(await lstat(destination)).isSymbolicLink(), "Refusing a linked sidecar output"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    assert.equal(path.dirname(destination), nativeRoot);
    await rm(destination, { recursive: true, force: true });
    await cp(path.join(extracted, "dist"), destination, { recursive: true });
    await cp(path.join(extracted, "sidecar.json"), path.join(root, "sidecar.json"));
    console.log(`Restored ${manifest.name}@${manifest.version}`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await restoreCreatorSidecars();
