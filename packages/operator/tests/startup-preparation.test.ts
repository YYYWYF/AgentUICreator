import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "vitest";
it("requires current source and output before accepting a preparation receipt", () => {
  execFileSync(process.execPath, ["--test", fileURLToPath(new URL("../../../scripts/preparation-state.test.mjs", import.meta.url))]);
});
