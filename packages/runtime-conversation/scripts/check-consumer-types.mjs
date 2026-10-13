import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnPnpm } from "../../../scripts/pnpm-process.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tscPath = path.join(packageRoot, "node_modules", "typescript", "bin", "tsc");
const consumerRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "runtime-conversation-consumer-")));

async function run(command, args, cwd = consumerRoot) {
  const options = { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "true", NODE_PATH: "" } };
  const child = command === "pnpm" ? spawnPnpm(args, options) : spawn(command, args, options);
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exitCode !== 0) throw new Error(output.trim() || `${command} exited with code ${exitCode}`);
  return output;
}

try {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  if (!manifest.dependencies?.["@assistant-ui/core"]) {
    throw new Error("The upstream adapter type seams require a declared @assistant-ui/core dependency.");
  }
  const archives = path.join(consumerRoot, "archives");
  await mkdir(archives);
  const dependencies = {};
  // Pack the actual publishable files; never symlink a workspace package or its node_modules.
  for (const name of ["runtime-core", "react", "runtime-conversation"]) {
    const destination = path.join(archives, name);
    await mkdir(destination);
    await run("pnpm", ["pack", "--pack-destination", destination], path.resolve(packageRoot, "..", name));
    const packed = (await readdir(destination)).filter(file => file.endsWith(".tgz"));
    if (packed.length !== 1) throw new Error(`Expected one archive for ${name}`);
    const archive = path.join(destination, packed[0]);
    dependencies[`@agent-ui/${name}`] = `file:${archive}`;
  }
  await writeFile(path.join(consumerRoot, "pnpm-workspace.yaml"),
    "packages: []\n");
  await writeFile(path.join(consumerRoot, "package.json"), JSON.stringify({
    name: "runtime-conversation-published-type-consumer", private: true, type: "module",
    dependencies,
    pnpm: { overrides: dependencies },
    // Match the pinned consumer React/type/compiler environment, but do not
    // declare core: its resolution must come from the published Runtime manifest.
    devDependencies: { "@types/react": "19.3.0", "@types/react-dom": "19.3.0", react: "19.1.1", "react-dom": "19.1.1" },
  }, null, 2));
  const storePath = (await run("pnpm", ["store", "path"], packageRoot)).trim();
  await run("pnpm", ["install", "--prefer-offline", "--ignore-scripts", "--no-frozen-lockfile",
    "--store-dir", path.dirname(storePath), "--fetch-retries=0", "--fetch-timeout=15000",
    "--config.enableGlobalVirtualStore=false", "--config.packageImportMethod=copy", "--config.nodeLinker=isolated"]);
  const installedRoot = path.join(consumerRoot, "node_modules", "@agent-ui", "runtime-conversation");
  const installedRealPath = await realpath(installedRoot);
  if (!installedRealPath.startsWith(consumerRoot + path.sep)) {
    throw new Error("Consumer package must resolve within the isolated install, never the workspace.");
  }
  const installedRequire = createRequire(path.join(installedRealPath, "package.json"));
  const coreEntry = await realpath(installedRequire.resolve("@assistant-ui/core"));
  if (!coreEntry.startsWith(consumerRoot + path.sep)) {
    throw new Error("The published upstream adapter dependency must resolve within the isolated install.");
  }
  const installedManifest = JSON.parse(await readFile(path.join(installedRoot, "package.json"), "utf8"));
  if (installedManifest.dependencies?.["@assistant-ui/core"] !== manifest.dependencies["@assistant-ui/core"]) {
    throw new Error("Packed Runtime manifest lost its declared upstream adapter dependency.");
  }
  await writeFile(path.join(consumerRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      exactOptionalPropertyTypes: true, lib: ["ES2022", "DOM"], module: "NodeNext",
      moduleResolution: "NodeNext", noEmit: true, skipLibCheck: false, strict: true,
      target: "ES2022", types: [],
    }, include: ["index.ts"],
  }, null, 2));
  await writeFile(path.join(consumerRoot, "index.ts"), `import {
  AgentUiRuntimeBusyError, ConversationRuntimeProvider, UnsupportedAgentInputError,
  createEphemeralConversationThreadBinding, type ConversationRuntimeProviderProps,
} from "@agent-ui/runtime-conversation";

const binding = createEphemeralConversationThreadBinding();
const adapter: NonNullable<ConversationRuntimeProviderProps["attachmentAdapter"]> = {
  accept: "image/*",
  async add({ file }) {
    return { id: "image", type: "image", name: file.name, file,
      status: { type: "requires-action", reason: "composer-send" } };
  },
  async remove() {},
  async send(attachment) {
    return { ...attachment, status: { type: "complete" },
      content: [{ type: "image", image: "https://example.test/image.png" }] };
  },
};
const dictationAdapter: NonNullable<ConversationRuntimeProviderProps["dictationAdapter"]> = {
  listen() {
    return {
      status: { type: "running" }, stop: async () => {}, cancel: () => {},
      onSpeechStart: () => () => {}, onSpeechEnd: () => () => {}, onSpeech: () => () => {},
    };
  },
};
const props: ConversationRuntimeProviderProps = {
  endpoint: "https://example.test/agent", threadBinding: binding,
  attachmentAdapter: adapter, dictationAdapter, children: null,
};
// @ts-expect-error upstream adapter contract must not become an untyped seam
const invalid: ConversationRuntimeProviderProps["attachmentAdapter"] = { accept: "image/*" };
// @ts-expect-error dictation must provide the official listen method
const invalidDictation: ConversationRuntimeProviderProps["dictationAdapter"] = { accept: "audio/*" };
void [AgentUiRuntimeBusyError, ConversationRuntimeProvider, UnsupportedAgentInputError, props, invalid, invalidDictation];
`);
  await access(tscPath);
  await run(process.execPath, [tscPath, "--project", path.join(consumerRoot, "tsconfig.json")]);
  console.log("@agent-ui/runtime-conversation published-package consumer typecheck: OK (isolated tarball install, skipLibCheck: false)");
} finally {
  await rm(consumerRoot, { recursive: true, force: true });
}
