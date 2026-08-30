import { chmod, copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/ui/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../src/ui/creator-workbench.css", import.meta.url),
  new URL("../dist/ui/creator-workbench.css", import.meta.url),
);
await chmod(new URL("../dist/cli.js", import.meta.url), 0o755);
