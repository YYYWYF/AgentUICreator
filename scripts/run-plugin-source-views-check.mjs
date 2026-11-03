import path from "node:path";
import { prepareTypeScriptAuthoring, typescriptAuthoringReadyEnv } from "./prepare-typescript-authoring.mjs";
import { spawnPnpmSync } from "./pnpm-process.mjs";
import { pluginResourceViewsReadyEnv, withPluginResourceViews } from "./plugin-resource-views.mjs";

const [action, ...providedArgs] = process.argv.slice(2);
const extraArgs = providedArgs[0] === "--" ? providedArgs.slice(1) : providedArgs;
const operator = action?.startsWith("operator-");
const workingDirectory = operator ? path.join(process.cwd(), "operator") : process.cwd();
const operation = operator ? action.slice("operator-".length) : action;
const environment = { ...process.env, [pluginResourceViewsReadyEnv]: "1" };

function run(args) {
  const result = spawnPnpmSync(args, { cwd: process.cwd(), env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

let status;
if (operation === "typecheck") {
  if (process.env[typescriptAuthoringReadyEnv] !== "1") await prepareTypeScriptAuthoring();
  status = run(["exec", "tsc", "--noEmit", "-p", path.join(workingDirectory, "tsconfig.json")]);
  if (status === 0) status = run(["exec", "tsc", "-p", path.join(workingDirectory, "tsconfig.tests.json")]);
} else if (operation === "test") {
  status = await withPluginResourceViews(async () => run(["exec", "vitest", "run", ...(operator ? ["--root", workingDirectory, "--config", path.join(workingDirectory, "vitest.config.ts")] : []), ...extraArgs]));
} else {
  throw new Error(`Unsupported source-view check: ${action ?? "<missing>"}`);
}
process.exitCode = status;
