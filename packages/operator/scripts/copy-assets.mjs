import { chmod, copyFile, mkdir, rm } from "node:fs/promises";

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
await chmod(new URL("../dist/cli.js", import.meta.url), 0o755);

// Retain deferred demos only in the workspace, never in the npm payload.
for (const name of ["a2ui-form-controls", "a2ui-interactive-order"]) {
  for (const extension of [".js", ".js.map", ".d.ts", ".d.ts.map"]) {
    await rm(new URL(`../dist/mock-agent/builtins/${name}${extension}`, import.meta.url), { force: true });
  }
}
