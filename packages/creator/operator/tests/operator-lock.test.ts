import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { acquireOperatorLock } from "../src/project/operator-lock";

const roots: string[] = [];
async function project() { const root = await mkdtemp(path.join(tmpdir(), "operator 排队 ")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, {recursive:true,force:true}))); });

it("waits for the current request, while another project remains independent", async () => {
  const root = await project();
  const release = await acquireOperatorLock(root);
  let acquired = false;
  const pending = acquireOperatorLock(root, {waitMs:1000}).then(unlock => { acquired = true; return unlock; });
  const otherRelease = await acquireOperatorLock(await project());
  expect(acquired).toBe(false);
  await otherRelease();
  await release();
  await (await pending)();
  expect(acquired).toBe(true);
});

it("bounds waiting and preserves fail-fast callers", async () => {
  const root = await project(); const release = await acquireOperatorLock(root);
  try {
    await expect(acquireOperatorLock(root)).rejects.toMatchObject({code:"OPERATOR_BUSY"});
    await expect(acquireOperatorLock(root, {waitMs:30})).rejects.toMatchObject({code:"OPERATOR_BUSY"});
  } finally { await release(); }
});

it.each([
  ".agent-ui/creator/control/operator.lock",
  ".agentuicreator/control/operator.lock",
])("honors a PID lock left at %s", async relativePath => {
  const { mkdir, writeFile, readFile, unlink } = await import("node:fs/promises");
  const root = await project();
  const legacyLock = path.join(root, relativePath);
  await mkdir(path.dirname(legacyLock), { recursive: true });
  await writeFile(legacyLock, String(process.pid));

  await expect(acquireOperatorLock(root, { waitMs: 30 })).rejects.toMatchObject({ code: "OPERATOR_BUSY" });
  expect(await readFile(legacyLock, "utf8")).toBe(String(process.pid));

  await unlink(legacyLock);
  const release = await acquireOperatorLock(root);
  await release();
});

it("serializes several contenders and supports repeated release", async () => {
  const root = await project();
  let inside = 0;
  await Promise.all(Array.from({length:8}, async () => {
    const release = await acquireOperatorLock(root, {waitMs:3000});
    try {
      expect(++inside).toBe(1);
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(inside--).toBe(1);
    } finally { await release(); await release(); }
  }));
});

it("concurrent stale recovery never removes a successor's ticket", async () => {
  const {mkdir, writeFile, readdir} = await import("node:fs/promises");
  const root = await project();
  const directory = path.join(root, ".agent-ui", "creator", "control", "operator-locks");
  await mkdir(directory, {recursive:true});
  // An exited child supplies a real dead PID on both Windows and Unix.
  const {spawn} = await import("node:child_process");
  const child = spawn(process.execPath, ["-e", ""]);
  await new Promise<void>((resolve, reject) => {child.once("exit", () => resolve());child.once("error", reject);});
  const token = "00000000-0000-0000-0000-000000000000";
  await writeFile(path.join(directory, `${child.pid}.${token}.json`), JSON.stringify({pid:child.pid,token,number:null}));
  let inside = 0;
  await Promise.all(Array.from({length:4}, async () => {
    const release = await acquireOperatorLock(root, {waitMs:3000});
    expect(++inside).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(inside--).toBe(1);
    await release();
  }));
  expect(await readdir(directory)).toEqual([]);
});

it("recovers the ticket of a terminated process before admitting its successor", async () => {
  const {spawn} = await import("node:child_process");
  const {pathToFileURL} = await import("node:url");
  const root = await project();
  const entry = pathToFileURL(path.resolve("dist/runtime/operator-runtime.mjs")).href;
  // Exercise real CLI acquisition (not a mocked PID) through the installed entry.
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import {handleUIOperatorRequest} from ${JSON.stringify(entry)};
    await handleUIOperatorRequest({operation:'inspect_ui_project',input:{}}, ${JSON.stringify(root)}, () => {
      process.stdout.write('admitted\\n');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
    });`], {stdio:["ignore","pipe","pipe"]});
  await new Promise<void>((resolve, reject) => {
    child.stdout.once("data", () => resolve());
    child.once("exit", code => reject(new Error(`Child exited before admission: ${code}`)));
    child.once("error", reject);
  });
  child.kill();
  await new Promise(resolve => child.once("exit", resolve));
  const release = await acquireOperatorLock(root, {waitMs:1000});
  await release();
});
