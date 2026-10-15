import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Test published tarballs outside the workspace overrides with matching host types.
for (const version of ["18.2.0", "18.3.1", "19.1.1", "19.2.0"]) {
  console.log(`Checking React ${version} consumer`);
  const child = spawn(process.execPath, [fileURLToPath(new URL(
    "../packages/runtime/scripts/check-consumer-types.mjs", import.meta.url,
  ))], { stdio: "inherit", env: { ...process.env, AGENT_UI_CONSUMER_REACT_VERSION: version } });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (code !== 0) throw new Error(`React ${version} consumer failed (${code})`);
}
