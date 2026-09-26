import path from "node:path";
import { fileURLToPath } from "node:url";

import { runUIProjectVerificationCli } from "../../agent-frontend/scripts/verify-ui";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
await runUIProjectVerificationCli(projectRoot);
