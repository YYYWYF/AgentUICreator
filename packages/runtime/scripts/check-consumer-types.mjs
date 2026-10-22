import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnPnpm } from "../../../scripts/pnpm-process.mjs";

// The default remains the pinned development baseline; CI can exercise real host versions.
const checkReactCompatibility = process.env.AGENT_UI_CONSUMER_REACT_VERSION !== undefined;
const reactVersion = process.env.AGENT_UI_CONSUMER_REACT_VERSION ?? "19.1.1";
const reactTypes = reactVersion.startsWith("18.") ? "18.3.31" : "19.3.0";
const reactDomTypes = reactVersion.startsWith("18.") ? "18.3.7" : "19.3.0";
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tscPath = path.join(packageRoot, "node_modules", "typescript", "bin", "tsc");
const consumerRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "runtime-consumer-")));

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
  const packageNames = ["core", "renderer", "plugins", "runtime"];
  if (checkReactCompatibility) packageNames.push("creator", "web-component");
  for (const name of packageNames) {
    const destination = path.join(archives, name);
    await mkdir(destination);
    await run("pnpm", ["pack", "--pack-destination", destination], path.resolve(packageRoot, "..", name));
    const packed = (await readdir(destination)).filter(file => file.endsWith(".tgz"));
    if (packed.length !== 1) throw new Error(`Expected one archive for ${name}`);
    const archive = path.join(destination, packed[0]);
    dependencies[`@za38.03/agent-ui-${name}`] = `file:${archive}`;
  }
  await writeFile(path.join(consumerRoot, "pnpm-workspace.yaml"),
    "packages: []\n");
  await writeFile(path.join(consumerRoot, "package.json"), JSON.stringify({
    name: "runtime-published-type-consumer", private: true, type: "module",
    packageManager: JSON.parse(await readFile(path.resolve(packageRoot, "../../package.json"), "utf8")).packageManager,
    dependencies,
    // Do not declare core: it must resolve from the published Runtime manifest.
    devDependencies: { "@types/react": reactTypes, "@types/react-dom": reactDomTypes,
      react: reactVersion, "react-dom": reactVersion, "react-test-renderer": reactVersion },
  }, null, 2));
  // Redirect unpublished workspace dependencies only. pnpm overrides also rewrite
  // peer ranges to file: URLs, which makes strict peer checking meaningless.
  await writeFile(path.join(consumerRoot, ".pnpmfile.cjs"), `
const archives = ${JSON.stringify(dependencies)};
module.exports = { hooks: { readPackage(pkg) {
  for (const field of ["dependencies", "optionalDependencies"]) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (archives[name]) pkg[field][name] = archives[name];
    }
  }
  return pkg;
} } };
`);
  const storePath = (await run("pnpm", ["store", "path"], packageRoot)).trim();
  await run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile",
    "--cache-dir", path.join(consumerRoot, "cache"), "--store-dir", path.dirname(storePath), "--fetch-retries=0", "--fetch-timeout=15000",
    "--strict-peer-dependencies", "--config.enableGlobalVirtualStore=false", "--config.packageImportMethod=copy", "--config.nodeLinker=isolated"]);
  const installedRoot = path.join(consumerRoot, "node_modules", "@za38.03", "agent-ui-runtime");
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
    }, include: ["index.ts", "assets.d.ts"],
  }, null, 2));
  await writeFile(path.join(consumerRoot, "assets.d.ts"), 'declare module "*.css";\n');
  await writeFile(path.join(consumerRoot, "index.ts"), `import {
  AgentUiRuntimeBusyError, ConversationRuntimeProvider, UnsupportedAgentInputError,
  createEphemeralConversationThreadBinding, type ConversationRuntimeProviderProps,
  AgentUIProvider, useAgentUI, useAgentUIState, useAgentUIEvent,
  type AgentUIUser, type AgentUIHost,
} from "@za38.03/agent-ui-runtime";

const optionalUser: AgentUIUser = {};
const hostHook: () => AgentUIHost = useAgentUI;
void [AgentUIProvider, hostHook, useAgentUIState, useAgentUIEvent, optionalUser];

${checkReactCompatibility ? `import { createElement } from "react";
import { Button } from "@za38.03/agent-ui-plugins";
import { LayoutRenderer } from "@za38.03/agent-ui-renderer";
import { CreatorWorkbench } from "@za38.03/agent-ui-creator/ui";
const hostUI = createElement(Button, null, "Send");
const hostLayout = createElement(LayoutRenderer, { root: { type: "slot", id: "main", slotId: "main" } });
const workbench: import("react").ComponentType<Parameters<typeof CreatorWorkbench>[0]> = CreatorWorkbench;
void [hostUI, hostLayout, workbench];
` : ""}
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
  if (checkReactCompatibility) {
    await writeFile(path.join(consumerRoot, "runtime-smoke.mjs"),
      await readFile(new URL("./react-consumer-smoke.mjs", import.meta.url), "utf8"));
    // These are frontend packages: exercise their real bundler resolution, including
    // extensionless imports and CSS, while keeping the host React external/shared.
    const buildRequire = createRequire(path.resolve(packageRoot, "../plugins/package.json"));
    const { build } = buildRequire("esbuild");
    await build({ absWorkingDir: consumerRoot, entryPoints: ["runtime-smoke.mjs"],
      outfile: "runtime-smoke-bundled.mjs", bundle: true, platform: "node", format: "esm",
      external: ["react", "react/*", "react-dom", "react-dom/*", "react-test-renderer"],
      loader: { ".css": "empty" },
      banner: { js: 'import { createRequire as createNodeRequire } from "node:module"; const require = createNodeRequire(import.meta.url);' },
    });
    await run(process.execPath, [path.join(consumerRoot, "runtime-smoke-bundled.mjs")]);
  }
  await access(tscPath);
  await run(process.execPath, [tscPath, "--project", path.join(consumerRoot, "tsconfig.json")]);
  console.log(`React ${reactVersion}: published-package strict peer install and consumer typecheck${checkReactCompatibility ? " and conversation runtime smoke" : ""} OK (isolated tarballs, skipLibCheck: false)`);
} finally {
  await rm(consumerRoot, { recursive: true, force: true });
}
