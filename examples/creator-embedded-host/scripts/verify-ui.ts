import path from "node:path";
import { fileURLToPath } from "node:url";

import { runUIProjectVerificationCli } from "@za38.03/agent-ui-operator/dev";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
await runUIProjectVerificationCli(projectRoot);
