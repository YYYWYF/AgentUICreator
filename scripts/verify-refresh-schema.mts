import { readFile, writeFile, mkdtemp, mkdir, cp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAppUIModelJson } from "../packages/project-control/src/framework/contracts/app-ui-model";
import { inspectCreatorProject as sourceInspect } from "../packages/project-control/src/project/creator-project-inspector";
import { inspectCreatorProject as compiledInspect } from "../packages/project-control/dist/runtime/project-control-runtime.mjs";
const host = path.resolve(import.meta.dirname, "../examples/creator-host-sandbox");
const file = path.join(host, "src/agent-ui/app-ui/app-ui.json");
const source = await readFile(file, "utf8");
const root = await mkdtemp(path.join(tmpdir(), "refresh-schema-"));
try {
  const model = parseAppUIModelJson(source);
  const actual = { source: await sourceInspect(host), compiled: await compiledInspect(host) };
  if (actual.source.status !== "ready" || actual.compiled.status !== "ready") throw new Error(JSON.stringify(actual));
  // Preserve the real Host. Header + Footer coverage is tested in an isolated copy.
  await cp(host, root, { recursive: true, filter: input => !["node_modules", "dist"].includes(path.basename(input)) });
  // Official package metadata resolution belongs to the Host's installed stack.
  const { symlink } = await import("node:fs/promises");
  await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"));
  const target = path.join(root, "src/agent-ui/app-ui/app-ui.json");
  const variant = JSON.parse(source);
  variant.root.footer = { type: "slot", plugins: [] };
  const footerSource = JSON.stringify(variant);
  parseAppUIModelJson(footerSource);
  await writeFile(target, footerSource);
  const footer = await compiledInspect(root);
  if (footer.status !== "ready") throw new Error(JSON.stringify(footer));
  variant.root.defaultActive = "nonexistent";
  const illegal = JSON.stringify(variant);
  let rejected = false;
  try { parseAppUIModelJson(illegal); } catch { rejected = true; }
  await writeFile(target, illegal);
  const invalid = await compiledInspect(root);
  if (!rejected || invalid.status !== "broken" || !invalid.issues.some(issue => issue.code === "AGENT_UI_APP_UI_MODEL_INVALID")) throw new Error("Illegal Sidebar was accepted");
  const after = await readFile(file, "utf8");
  if (after !== source) throw new Error("Real AppUIModel changed");
  console.log(JSON.stringify({ runtime: path.resolve(import.meta.dirname, "../packages/project-control/dist/runtime/project-control-runtime.mjs"), schema: model.root.type, realSource: actual.source.status, realCompiled: actual.compiled.status, headerFooterCompiled: footer.status, illegalSourceRejected: rejected, illegalCompiledRejected: invalid.status, modelHash: createHash("sha256").update(source).digest("hex"), unchanged: true }, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }
