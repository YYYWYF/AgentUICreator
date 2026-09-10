import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/layout/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../src/layout/layout.css", import.meta.url),
  new URL("../dist/layout/layout.css", import.meta.url),
);
