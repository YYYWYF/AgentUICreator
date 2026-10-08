import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const registry = fileURLToPath(new URL("../../source-registry/registry/items/", import.meta.url));
const verification = spawnSync("pnpm", ["--filter", "@agent-ui/source-registry", "exec", "node", "--import", "tsx", "scripts/verify-package-services.mjs"], { cwd: root, stdio: "inherit" });
if (verification.status !== 0) throw new Error("OFFICIAL_PACKAGE_SERVICE_METADATA_DRIFT: reference validation failed");
const generated = `${root}.generated`;
await rm(generated, { recursive: true, force: true });
await rm(`${root}dist`, { recursive: true, force: true });
await mkdir(generated, { recursive: true });
await cp(`${registry}foundation-core-contracts/files/framework`, `${generated}/framework`, { recursive: true });
await cp(`${registry}plugin-assistant-ui-composer/files/plugins`, `${generated}/plugins`, { recursive: true });
const implementationPath = `${generated}/plugins/assistant-ui-composer/index.tsx`;
await writeFile(implementationPath, (await readFile(implementationPath, "utf8")).replace('"../../agent-ui/i18n/useAgentUILocale"', '"@agent-ui/react"'));
const definitionPath = `${generated}/plugins/assistant-ui-composer/definition.ts`;
await writeFile(definitionPath, (await readFile(definitionPath, "utf8")).replace('import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";', 'const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale";'));
const source = await readFile(`${registry}plugin-assistant-ui-composer/files/plugins/assistant-ui-composer/definition.ts`, "utf8");
const compatibleSource = await readFile(definitionPath, "utf8");
if (!compatibleSource.includes('from "../../framework/contracts/ui-plugin"') || /\.\.\/\.\.\/(?:agent-ui|runtime|services)\//.test(compatibleSource)) throw new Error("Official plugin is not package compatible");
await writeFile(`${generated}/tsconfig.json`, JSON.stringify({ compilerOptions: {
  target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true,
  skipLibCheck: true, resolveJsonModule: true, declaration: true, emitDeclarationOnly: true,
  outDir: "../dist/types", rootDir: ".",
}, include: ["**/*.ts", "**/*.tsx"] }));
const result = spawnSync("pnpm", ["exec", "tsc", "-p", `${generated}/tsconfig.json`], { cwd: root, stdio: "inherit" });
if (result.status !== 0) throw new Error("Official plugin type compilation failed");
const output = await build({ entryPoints: { "assistant-ui-composer/index": `${generated}/plugins/assistant-ui-composer/definition.ts` },
  outdir: `${root}dist`, bundle: true, packages: "external", format: "esm", platform: "browser", jsx: "automatic", metafile: true });
await writeFile(`${root}dist/assistant-ui-composer/index.d.ts`, 'export { default, assistantUiComposerPlugin } from "../types/plugins/assistant-ui-composer/definition.js";\n');
await writeFile(`${root}dist/build-provenance.json`, JSON.stringify({ referenceSourceItemId: "plugin/assistant-ui-composer", sourceHash: createHash("sha256").update(Buffer.concat(await Promise.all(["definition.ts", "index.tsx", "manifest.json"].map(async file => Buffer.concat([Buffer.from(file + "\0"), await readFile(`${registry}plugin-assistant-ui-composer/files/plugins/assistant-ui-composer/${file}`)]))))).digest("hex"), inputs: Object.keys(output.metafile.inputs) }, null, 2));
