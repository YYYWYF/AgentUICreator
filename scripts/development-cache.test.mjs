import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  acquireDevelopmentSession,
  openDevelopmentCache,
  probeDevelopmentCache,
  workspaceDevelopmentId,
} from "./development-cache.mjs";

const roots = [];
const children = new Set();
afterEach(async () => {
  await Promise.all(
    [...children].map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const closed = once(child, "close");
      child.kill();
      await closed;
    }),
  );
  children.clear();
  for (const root of roots.splice(0))
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), "Agent UI 缓存 space "));
  roots.push(root);
  return { root, base: path.join(root, "temporary") };
}
function worker(source, values) {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
    import { acquireDevelopmentSession, openDevelopmentCache } from ${JSON.stringify(new URL("./development-cache.mjs", import.meta.url).href)};
    const values = ${JSON.stringify(values)};
    ${source}
  `,
    ],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  children.add(child);
  let stderr = "";
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  child.on("error", () => {});
  const message = () =>
    new Promise((resolve, reject) => {
      const got = (value) => {
        cleanup();
        resolve(value);
      };
      const closed = () => {
        cleanup();
        reject(new Error(`Worker exited: ${stderr}`));
      };
      function cleanup() {
        child.off("message", got);
        child.off("close", closed);
      }
      child.once("message", got);
      child.once("close", closed);
    });
  return { child, message };
}

test("canonical Windows workspace identities cover drive case, spaces, Unicode and UNC", () => {
  assert.equal(
    workspaceDevelopmentId("C:\\公司 Projects\\UI", "win32"),
    workspaceDevelopmentId("c:/公司 Projects/UI/.", "win32"),
  );
  assert.equal(
    workspaceDevelopmentId("\\\\SERVER\\Share\\UI", "win32"),
    workspaceDevelopmentId("\\\\server\\share\\ui", "win32"),
  );
  assert.notEqual(
    workspaceDevelopmentId("C:\\UI", "win32"),
    workspaceDevelopmentId("D:\\UI", "win32"),
  );
  assert.notEqual(
    workspaceDevelopmentId("/tmp/UI", "darwin"),
    workspaceDevelopmentId("/tmp/ui", "darwin"),
  );
});

test("rejects a second process before admission and reclaims only a dead owner's ticket", async () => {
  const values = fixture();
  const first = worker(
    `
    acquireDevelopmentSession(values.root, { base: values.base });
    process.send({ ready: true });
    process.on('message', () => {});
  `,
    values,
  );
  await first.message();
  assert.throws(
    () => acquireDevelopmentSession(values.root, { base: values.base }),
    { code: "AGENT_UI_DEV_BUSY" },
  );
  const closed = once(first.child, "close");
  first.child.kill();
  await closed;
  const release = acquireDevelopmentSession(values.root, { base: values.base });
  assert.throws(
    () => acquireDevelopmentSession(values.root, { base: values.base }),
    { code: "AGENT_UI_DEV_BUSY" },
  );
  release();
  // An old release cannot remove a successor's unique ticket.
  const successor = acquireDevelopmentSession(values.root, {
    base: values.base,
  });
  release();
  assert.throws(
    () => acquireDevelopmentSession(values.root, { base: values.base }),
    { code: "AGENT_UI_DEV_BUSY" },
  );
  successor();
});

test("simultaneous processes never share a session", async () => {
  const values = fixture();
  const contenders = Array.from({ length: 6 }, () =>
    worker(
      `
    process.send({ ready: true });
    process.once('message', () => {
      try {
        const release = acquireDevelopmentSession(values.root, { base: values.base });
        process.send({ acquired: true });
        process.once('message', () => { release(); process.disconnect(); });
      } catch (error) { process.send({ acquired: false, code: error.code }); process.disconnect(); }
    });
  `,
      values,
    ),
  );
  await Promise.all(contenders.map((item) => item.message()));
  const results = contenders.map((item) => item.message());
  for (const item of contenders) item.child.send("start");
  const answers = await Promise.all(results);
  assert.ok(answers.filter((answer) => answer.acquired).length <= 1);
  for (let index = 0; index < answers.length; index++) {
    if (answers[index].acquired) contenders[index].child.send("release");
    else assert.equal(answers[index].code, "AGENT_UI_DEV_BUSY");
  }
});

test("reuses clean matching output, isolates roles and switches generations when inputs change", () => {
  const options = fixture();
  const first = openDevelopmentCache(
    options.root,
    "workbench",
    ["package-v1"],
    options,
  );
  assert.equal(first.reused, false);
  assert.ok(
    !first.cacheDir.startsWith(path.join(options.root, "node_modules")),
  );
  const artifact = path.join(first.cacheDir, "sentinel.js.map");
  fs.writeFileSync(artifact, "old output");
  const preview = openDevelopmentCache(
    options.root,
    "host-preview",
    ["package-v1"],
    options,
  );
  assert.notEqual(preview.cacheDir, first.cacheDir);
  assert.throws(
    () =>
      openDevelopmentCache(options.root, "workbench", ["package-v1"], options),
    { code: "AGENT_UI_DEV_BUSY" },
  );
  preview.finish(true);
  first.finish(true);
  const reused = openDevelopmentCache(
    options.root,
    "workbench",
    ["package-v1"],
    options,
  );
  assert.equal(reused.reused, true);
  assert.equal(reused.cacheDir, first.cacheDir);
  reused.finish(true);
  const changed = openDevelopmentCache(
    options.root,
    "workbench",
    ["package-v2"],
    options,
  );
  assert.equal(changed.reused, false);
  assert.notEqual(changed.cacheDir, first.cacheDir);
  assert.equal(fs.readFileSync(artifact, "utf8"), "old output");
  changed.finish();
});

test("abrupt optimizer exit selects a fresh generation without deleting its files", async () => {
  const options = fixture();
  const owner = worker(
    `
    const cache = openDevelopmentCache(values.root, 'workbench', ['v1'], values);
    process.send({ cacheDir: cache.cacheDir });
    process.on('message', () => {});
  `,
    options,
  );
  const { cacheDir } = await owner.message();
  const artifact = path.join(cacheDir, "react-markdown.js.map");
  fs.writeFileSync(artifact, "possibly held by an old esbuild process");
  const closed = once(owner.child, "close");
  owner.child.kill();
  await closed;
  const next = openDevelopmentCache(options.root, "workbench", ["v1"], options);
  assert.equal(next.reused, false);
  assert.notEqual(next.cacheDir, cacheDir);
  assert.ok(fs.existsSync(artifact));
  next.finish(true);
});

test("an unavailable clean cache switches directories without deleting the old path", () => {
  const options = fixture();
  const first = openDevelopmentCache(
    options.root,
    "workbench",
    ["v1"],
    options,
  );
  first.finish(true);
  fs.rmSync(first.cacheDir, { recursive: true });
  fs.writeFileSync(first.cacheDir, "an unusable old cache path");
  const warnings = [];
  const next = openDevelopmentCache(options.root, "workbench", ["v1"], {
    ...options,
    warn: (value) => warnings.push(value),
  });
  assert.equal(next.reused, false);
  assert.notEqual(next.cacheDir, first.cacheDir);
  assert.equal(
    fs.readFileSync(first.cacheDir, "utf8"),
    "an unusable old cache path",
  );
  assert.equal(warnings.length, 1);
  next.finish(true);
});

test("bounded retries tolerate sharing errors and report persistent Windows access failures", () => {
  const { root } = fixture();
  let attempts = 0;
  probeDevelopmentCache(root, {
    ...fs,
    renameSync(...args) {
      if (++attempts <= 2)
        throw Object.assign(new Error("sharing violation"), { code: "EPERM" });
      fs.renameSync(...args);
    },
  });
  assert.equal(attempts, 3);
  attempts = 0;
  assert.throws(
    () =>
      probeDevelopmentCache(root, {
        ...fs,
        writeFileSync() {
          attempts++;
          throw Object.assign(new Error("Access is denied"), {
            code: "EACCES",
          });
        },
      }),
    (error) =>
      error.code === "AGENT_UI_DEV_CACHE_ACCESS" &&
      error.message.includes(root) &&
      error.message.includes("EACCES"),
  );
  assert.equal(attempts, 6);
  assert.deepEqual(fs.readdirSync(root), []);
});
