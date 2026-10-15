import { chmod, copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertContractParity } from "./contract-integrity.mjs";

await mkdir(new URL("../dist/ui/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../src/ui/creator-workbench.css", import.meta.url),
  new URL("../dist/ui/creator-workbench.css", import.meta.url),
);
await mkdir(new URL("../dist/ui/components/", import.meta.url), { recursive: true });
for (const name of ["creator-ui.css", "LICENSE.md"]) {
  await copyFile(
    new URL(`../src/ui/components/${name}`, import.meta.url),
    new URL(`../dist/ui/components/${name}`, import.meta.url),
  );
}
await mkdir(new URL("../dist/ui/setup/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../src/ui/setup/creator-project-setup.css", import.meta.url),
  new URL("../dist/ui/setup/creator-project-setup.css", import.meta.url),
);
await mkdir(new URL("../dist/python/", import.meta.url), { recursive: true });
await cp(
  new URL("../python/agent_ui_creator/", import.meta.url),
  new URL("../dist/python/agent_ui_creator/", import.meta.url),
  {
    recursive: true,
    filter: (source) => path.basename(source) !== "__pycache__",
  },
);
await copyFile(
  new URL("../python/pyproject.toml", import.meta.url),
  new URL("../dist/python/pyproject.toml", import.meta.url),
);
await copyFile(
  new URL("../python/requirements.lock", import.meta.url),
  new URL("../dist/python/requirements.lock", import.meta.url),
);
await cp(
  new URL("../../../contracts/creator/", import.meta.url),
  new URL("../dist/python/agent_ui_creator/_contracts/creator/", import.meta.url),
  { recursive: true },
);
await assertContractParity(
  fileURLToPath(new URL("../../../contracts/creator/", import.meta.url)),
  fileURLToPath(new URL("../dist/python/agent_ui_creator/_contracts/creator/", import.meta.url)),
);
await chmod(new URL("../dist/cli.js", import.meta.url), 0o755);

// Retain deferred demos only in the workspace, never in the npm payload.
for (const name of ["a2ui-form-controls", "a2ui-interactive-order"]) {
  for (const extension of [".js", ".js.map", ".d.ts", ".d.ts.map"]) {
    await rm(new URL(`../dist/mock-agent/builtins/${name}${extension}`, import.meta.url), { force: true });
  }
}
