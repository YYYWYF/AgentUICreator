import path from "node:path";
import { fileURLToPath } from "node:url";

import { runUIProjectControlCli } from "../../agent-frontend/scripts/ui-project-control";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
await runUIProjectControlCli(projectRoot);
