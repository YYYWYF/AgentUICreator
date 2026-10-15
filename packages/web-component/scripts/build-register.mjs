import { build as buildVite } from "vite";
import { build as buildScript } from "esbuild";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

await buildVite({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
});
// Vite owns React, Tailwind and CSS processing. Finish both standalone formats
// without relying on Rolldown's multi-format dynamic-import splitting.
const outputs = [];
for (const format of ["esm", "iife"]) {
  const result = await buildScript({
    entryPoints: [fileURLToPath(new URL("../dist/agent-ui.es.js", import.meta.url))],
    outfile: fileURLToPath(new URL(`../dist/${format === "esm" ? "agent-ui.es.js" : "agent-ui.js"}`, import.meta.url)),
    bundle: true, splitting: false, write: false, allowOverwrite: true,
    format, globalName: "AgentUIWebComponent", platform: "browser", target: "es2022",
  });
  outputs.push(...result.outputFiles);
}
for (const output of outputs) await writeFile(output.path, output.contents);
