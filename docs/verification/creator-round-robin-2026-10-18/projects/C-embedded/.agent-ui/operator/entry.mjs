// Agent UI managed Operator; development only. Reinstall on tool upgrade.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runUIOperatorCli } from "file:///Users/yifei/Coding/AgentUICreator/packages/operator/dist/runtime/operator-runtime.mjs";
await runUIOperatorCli(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
