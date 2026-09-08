import { chmod, copyFile, cp, mkdir } from "node:fs/promises";
import path from "node:path";

await mkdir(new URL("../dist/ui/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../src/ui/creator-workbench.css", import.meta.url),
  new URL("../dist/ui/creator-workbench.css", import.meta.url),
);
await mkdir(new URL("../dist/python/", import.meta.url), { recursive: true });
await cp(
  new URL("../../creator-python/agent_ui_creator/", import.meta.url),
  new URL("../dist/python/agent_ui_creator/", import.meta.url),
  {
    recursive: true,
    filter: (source) => path.basename(source) !== "__pycache__",
  },
);
await copyFile(
  new URL("../../creator-python/pyproject.toml", import.meta.url),
  new URL("../dist/python/pyproject.toml", import.meta.url),
);
await copyFile(
  new URL("../../creator-python/requirements.lock", import.meta.url),
  new URL("../dist/python/requirements.lock", import.meta.url),
);
await chmod(new URL("../dist/cli.js", import.meta.url), 0o755);
