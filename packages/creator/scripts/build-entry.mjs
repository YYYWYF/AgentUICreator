import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sidecarSourceHash } from "./sidecar-source.mjs";
import { syncPackageReleaseMetadata } from "../../../scripts/sync-package-release-metadata.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const operator = JSON.parse(await readFile(new URL("../../operator/package.json", import.meta.url), "utf8"));
assert.equal(manifest.dependencies[operator.name], "workspace:*");
const nodeEntries = new Set([".", "./vite", "./server", "./dock/vite", "./dock/rsbuild", "./dock/webpack"]);
const outputs = new Map();
outputs.set("dist/initialize.js", `import { configureCreatorDistribution } from "@za38.03/agent-ui-operator/creator-runtime";\nimport { fileURLToPath } from "node:url";\nconfigureCreatorDistribution(fileURLToPath(new URL("../", import.meta.url)));\n`);
outputs.set("dist/cli.js", '#!/usr/bin/env node\nimport "./initialize.js";\nawait import("@za38.03/agent-ui-operator/cli");\n');
outputs.set("dist/PythonCreatorProcessManager.js", 'import "./initialize.js";\nexport * from "@za38.03/agent-ui-operator/python-process";\n');
for (const [subpath, exported] of Object.entries(manifest.exports)) {
  if (["./package.json", "./compatibility.json"].includes(subpath)) continue;
  const target = subpath.replace(/^\.\/operator(?=\/|$)/u, "./project");
  assert(operator.exports[target], `Operator does not implement ${subpath}`);
  const specifier = operator.name + (target === "." ? "" : target.slice(1));
  const entries = typeof exported === "string" ? { import: exported } : exported;
  for (const [condition, destination] of Object.entries(entries)) {
    const logical = destination.replace(/^\.\//u, "");
    if (logical.endsWith(".css")) {
      outputs.set(logical, `@import ${JSON.stringify(specifier)};\n`);
      continue;
    }
    const initialize = path.posix.relative(path.posix.dirname(logical), "dist/initialize.js");
    const initImport = nodeEntries.has(subpath) && condition !== "types"
      ? `import ${JSON.stringify(initialize.startsWith(".") ? initialize : "./" + initialize)};\n` : "";
    outputs.set(logical, `${initImport}export * from ${JSON.stringify(specifier)};\n`);
  }
}
outputs.set("dist/python-sidecar.json", JSON.stringify({ schemaVersion: 1, sourceHash: await sidecarSourceHash(root) }, null, 2) + "\n");
if (process.argv.includes("--check")) {
  for (const [name, content] of outputs) assert.equal(await readFile(path.join(root, ...name.split("/")), "utf8"), content, `Rebuild Creator entry: ${name}`);
} else {
  // The target is fixed under this package; preserve no previous TS payload.
  await rm(path.join(root, "dist"), { recursive: true, force: true });
  for (const [name, content] of outputs) {
    const file = path.join(root, ...name.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, { mode: name === "dist/cli.js" ? 0o755 : 0o644 });
  }
  await syncPackageReleaseMetadata("creator");
}
