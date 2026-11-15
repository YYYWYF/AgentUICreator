import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execNpm, npmInvocation } from "./npm-process.mjs";

test("npm reuses its own JS launcher and does not mistake pnpm for npm", () => {
  const args = ["view", "react@>=18 <20 || >=21", "--json"];
  const entry = "C:\\Program Files\\npm\\npm-cli.js";
  assert.deepEqual(npmInvocation(args, { npm_execpath: entry }, "win32"), {
    command: process.execPath, args: [entry, ...args], shell: false,
  });
  assert.equal(npmInvocation(args, { npm_execpath: "C:\\Tools\\pnpm.cjs" }, "win32").command, "npm.cmd");
  assert.deepEqual(npmInvocation(args, {}, "linux"), { command: "npm", args, shell: false });
});

test("Windows npm fallback quotes ranges and rejects cmd expansion tokens", () => {
  assert.deepEqual(npmInvocation(["view", "react@>=18 <20 || >=21"], {}, "win32"), {
    command: "npm.cmd", args: ['"view"', '"react@>=18 <20 || >=21"'], shell: true,
  });
  for (const arg of ['a"b', "%TOKEN%", "!TOKEN!", "a\nb", "a\rb"]) {
    assert.throws(() => npmInvocation([arg], {}, "win32"), /Unsupported Windows npm argument/);
  }
});

test("npm JS execution preserves Unicode paths, arguments and failure output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "npm process 中文 space "));
  try {
    const entry = path.join(root, "npm-cli.js");
    await writeFile(entry, 'require("node:fs").writeFileSync("args.json",JSON.stringify(process.argv.slice(2))); console.log("output"); console.error("failure"); process.exit(7);');
    const args = ["view", "react@>=18 <20 || >=21", "中文 & space"];
    await assert.rejects(execNpm(args, { cwd: root, encoding: "utf8", env: { ...process.env, npm_execpath: entry } }), error => {
      assert.equal(error.code, 7);
      assert.equal(error.stdout.trim(), "output");
      assert.equal(error.stderr.trim(), "failure");
      return true;
    });
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "args.json"), "utf8")), args);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("installed npm runs through its shim with spaces, Unicode and shell metacharacters", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "npm shim 中文 & (space) "));
  try {
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "windows-npm-fixture" }));
    const { stdout } = await execNpm(["--prefix", root, "pkg", "get", "name"], {
      encoding: "utf8", timeout: 30_000, env: { ...process.env, npm_execpath: "pnpm.cjs" },
    });
    assert.equal(JSON.parse(stdout), "windows-npm-fixture");
  } finally { await rm(root, { recursive: true, force: true }); }
});
