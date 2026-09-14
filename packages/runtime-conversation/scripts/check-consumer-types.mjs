import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tscPath = path.join(packageRoot, "node_modules", "typescript", "bin", "tsc");
const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "runtime-conversation-consumer-"));

async function runTypeScript() {
  await access(tscPath);
  const child = spawn(
    process.execPath,
    [tscPath, "--project", path.join(consumerRoot, "tsconfig.json")],
    { cwd: consumerRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exitCode !== 0) throw new Error(output.trim() || `tsc exited with code ${exitCode}`);
}

try {
  const packageLinkParent = path.join(
    consumerRoot,
    "node_modules",
    "@agent-ui",
  );
  await mkdir(packageLinkParent, { recursive: true });
  await symlink(
    packageRoot,
    path.join(packageLinkParent, "runtime-conversation"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeFile(path.join(consumerRoot, "package.json"), JSON.stringify({
    name: "runtime-conversation-type-consumer",
    private: true,
    type: "module",
  }, null, 2));
  await writeFile(path.join(consumerRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      exactOptionalPropertyTypes: true,
      lib: ["ES2022", "DOM"],
      module: "NodeNext",
      moduleResolution: "NodeNext",
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: "ES2022",
      types: [],
    },
    include: ["index.ts"],
  }, null, 2));
  await writeFile(path.join(consumerRoot, "index.ts"), `import {
  AgentUiRuntimeBusyError,
  ConversationRuntimeProvider,
  UnsupportedAgentInputError,
  createEphemeralConversationThreadBinding,
  type ConversationLoadedThread,
  type ConversationObservationSnapshot,
  type ConversationThreadBinding,
} from "@agent-ui/runtime-conversation";

const binding: ConversationThreadBinding = createEphemeralConversationThreadBinding();
const loadedThread: ConversationLoadedThread | undefined = undefined;
const observation: ConversationObservationSnapshot | undefined = undefined;

void [
  AgentUiRuntimeBusyError,
  ConversationRuntimeProvider,
  UnsupportedAgentInputError,
  binding,
  loadedThread,
  observation,
];
`);
  await runTypeScript();
  console.log("@agent-ui/runtime-conversation consumer typecheck: OK (skipLibCheck: false)");
} finally {
  await rm(consumerRoot, { recursive: true, force: true });
}
