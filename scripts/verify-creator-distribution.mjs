import { pnpm, repositoryRoot, run } from "./creator-distribution-helpers.mjs";
import { fileURLToPath } from "node:url";

await run(process.execPath, ["--test", "scripts/creator-sidecar-distribution.test.mjs", "scripts/creator-sidecar-audit.test.mjs", "scripts/creator-node-artifact-audit.test.mjs"], { cwd: repositoryRoot });
await run(pnpm, ["--filter", "@za38.03/agent-ui-operator", "exec", "vitest", "run", "tests/python-executable-resolution.test.ts", "tests/packaged-sidecar.test.ts"], { cwd: repositoryRoot });
await run(pnpm, ["--filter", "@za38.03/agent-ui-creator", "build"], { cwd: repositoryRoot });
for (const script of ["verify-creator-package.mjs", "test-creator-package-runtime.mjs"]) {
  await run(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { cwd: repositoryRoot, env: { ...process.env, CREATOR_DISTRIBUTION_SKIP_BUILD: "1" } });
}
