import { mkdir, cp, copyFile } from "node:fs/promises";

// Bundle the project-control module inside the TypeScript Operator artifact.
await mkdir(new URL("../dist/operator/src/", import.meta.url), { recursive: true });
await cp(new URL("../control/dist/", import.meta.url), new URL("../dist/operator/dist/", import.meta.url), { recursive: true });
await cp(new URL("../control/presets/", import.meta.url), new URL("../dist/operator/presets/", import.meta.url), { recursive: true });
for (const name of ["install.mjs", "runtime-integrity.mjs"]) {
  await copyFile(new URL(`../control/src/${name}`, import.meta.url), new URL(`../dist/operator/src/${name}`, import.meta.url));
}
