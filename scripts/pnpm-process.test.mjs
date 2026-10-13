import assert from "node:assert/strict";
import { test } from "node:test";
import { pnpmInvocation } from "./pnpm-process.mjs";

test("Windows uses the existing pnpm JS entry without a shell, preserving paths with spaces", () => {
  const args = ["--dir", "C:\\Company Projects\\Agent UI", "build"];
  const result = pnpmInvocation(args, { cwd: "C:\\Company Projects" }, { npm_execpath: "C:/Program Files/pnpm/pnpm.cjs" }, "win32");
  assert.equal(result.command, process.execPath);
  assert.deepEqual(result.args, ["C:/Program Files/pnpm/pnpm.cjs", ...args]);
  assert.equal(result.options.shell, false);
  assert.equal(result.options.cwd, "C:\\Company Projects");
});
test("direct Windows invocation uses the cmd shim; Unix invocation avoids a shell", () => {
  assert.equal(pnpmInvocation(["build"], {}, {}, "win32").command, "pnpm.cmd");
  assert.equal(pnpmInvocation(["build"], {}, {}, "win32").options.shell, true);
  assert.deepEqual(pnpmInvocation(["--dir", "C:\\Company Projects"], {}, {}, "win32").args, ['"--dir"', '"C:\\Company Projects"']);
  assert.throws(() => pnpmInvocation(["%TOKEN%"], {}, {}, "win32"));
  assert.equal(pnpmInvocation(["build"], {}, {}, "darwin").command, "pnpm");
  assert.equal(pnpmInvocation(["build"], {}, {}, "darwin").options.shell, false);
});

test("Windows standalone pnpm.exe runs directly instead of being passed to Node", () => {
  const result = pnpmInvocation(["dev"], {}, { npm_execpath: "C:/Program Files/pnpm/pnpm.exe" }, "win32");
  assert.equal(result.command, "C:/Program Files/pnpm/pnpm.exe");
  assert.deepEqual(result.args, ["dev"]);
  assert.equal(result.options.shell, false);
});
