import path from "node:path";
import { fileURLToPath } from "node:url";

import { runUIProjectVerificationCli } from "@agent-ui/project-control/dev";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
await runUIProjectVerificationCli(projectRoot);
