import { pnpm, repositoryRoot, run } from "./creator-distribution-helpers.mjs";
import { fileURLToPath } from "node:url";

await run(pnpm, ["--filter", "@agent-ui/creator", "exec", "vitest", "run", "tests/managed-python-environment.test.ts", "tests/python-executable-resolution.test.ts"], { cwd: repositoryRoot });
for (const script of ["verify-creator-package.mjs", "verify-creator-python-wheel.mjs", "test-creator-package-runtime.mjs"]) {
  await run(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { cwd: repositoryRoot });
}
