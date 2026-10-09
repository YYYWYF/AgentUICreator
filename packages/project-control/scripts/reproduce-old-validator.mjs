import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), "pre-sidebar-validator-"));
try {
  const ref = "770a6793^:packages/project-control/src/framework/contracts/app-ui-model.ts";
  const oldSource = execFileSync("git", ["show", ref], { cwd: workspace, encoding: "utf8" });
  await build({ stdin: { contents: oldSource, resolveDir: path.join(workspace, "packages/project-control/src/framework/contracts"), loader: "ts" }, outfile: path.join(directory, "old-validator.mjs"), bundle: true, platform: "node", format: "esm" });
  const { parseAppUIModelJson } = await import(pathToFileURL(path.join(directory, "old-validator.mjs")).href);
  const raw = await readFile(path.join(workspace, "examples/creator-host-sandbox/src/agent-ui/app-ui/app-ui.json"), "utf8");
  let issues;
  try { parseAppUIModelJson(raw); } catch (error) { issues = error.issues; }
  if (!issues?.some(issue => issue.code === "invalid_union")) throw new Error("Historical validator did not reproduce invalid_union");
  const { inspectCreatorProject } = await import("../dist/runtime/project-control-runtime.mjs");
  const current = await inspectCreatorProject(path.join(workspace, "examples/creator-host-sandbox"));
  if (current.status !== "ready") throw new Error(JSON.stringify(current));
  console.log(JSON.stringify({ reproductionRef: ref, oldCompiledValidator: issues, currentCompiledValidator: current.status, sameAppUIModel: true }, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
