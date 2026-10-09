import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "vitest";
it("detects a replaced or missing Project Control build in a cached Node module", () => {
  execFileSync(process.execPath, ["--test", fileURLToPath(new URL("../scripts/test-runtime-integrity.mjs", import.meta.url))]);
});
