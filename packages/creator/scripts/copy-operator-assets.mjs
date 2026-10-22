import { mkdir, cp, copyFile } from "node:fs/promises";

// Keep Operator release paths intact inside the Creator artifact.
await mkdir(new URL("../dist/operator/src/", import.meta.url), { recursive: true });
await cp(new URL("../operator/dist/", import.meta.url), new URL("../dist/operator/dist/", import.meta.url), { recursive: true });
await cp(new URL("../operator/presets/", import.meta.url), new URL("../dist/operator/presets/", import.meta.url), { recursive: true });
for (const name of ["install.mjs", "runtime-integrity.mjs"]) {
  await copyFile(new URL(`../operator/src/${name}`, import.meta.url), new URL(`../dist/operator/src/${name}`, import.meta.url));
}
