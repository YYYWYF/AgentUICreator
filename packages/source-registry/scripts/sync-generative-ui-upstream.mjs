import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const defaultRoot = fileURLToPath(new URL("../../../", import.meta.url));
const packageName = "@assistant-ui/react-generative-ui";
const componentPath = "packages/ui/src/components/react/assistant-ui/elements/generative-ui.tsx";
const cssPath = "packages/ui/src/lib/generative-ui-vocabulary-css.ts";
const tscPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin/tsc");

function nextPatch(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(version ?? "");
  if (!match || !Number.isSafeInteger(Number(match[3])) || Number(match[3]) === Number.MAX_SAFE_INTEGER) {
    throw new Error(`Generative UI Source Item requires a stable patch version; got ${version}.`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

async function previousContent(filename) {
  return readFile(filename).catch(error => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
}

async function writeChanged(filename, content) {
  const bytes = Buffer.from(content);
  if ((await previousContent(filename))?.equals(bytes)) return false;
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, bytes);
  return true;
}

function option(name, args) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function main({
  root = defaultRoot,
  repo = process.env.ASSISTANT_UI_REPO ?? path.resolve(root, "../assistant-ui"),
  revision,
} = {}) {
  const target = JSON.parse(await readFile(path.join(root, "assistant-ui-upgrade-target.json"), "utf8"));
  const version = target.packages[packageName];
  if (!/^[a-f0-9]{40}$/u.test(revision ?? "")) throw new Error("--revision requires an exact release commit SHA");
  if (target.generativeUiReleaseRevision !== revision) {
    throw new Error(`Generative UI revision ${revision} does not match target.generativeUiReleaseRevision ${target.generativeUiReleaseRevision}.`);
  }
  const source = name => execFileSync("git", ["-C", repo, "show", `${revision}:${name}`], { encoding: "utf8" });
  const releaseManifest = JSON.parse(source("packages/react-generative-ui/package.json"));
  if (releaseManifest.name !== packageName || releaseManifest.version !== version) {
    throw new Error(`Revision ${revision} contains ${releaseManifest.name}@${releaseManifest.version}; expected ${packageName}@${version}.`);
  }
  const component = source(componentPath);
  const cssSource = source(cssPath);
  const temporary = await mkdtemp(path.join(tmpdir(), "generative-ui-source-"));
  let css;
  try {
    const sourcePath = path.join(temporary, "vocabulary.ts");
    const modulePath = path.join(temporary, "vocabulary.js");
    await writeFile(sourcePath, cssSource);
    await writeFile(path.join(temporary, "package.json"), '{"type":"module"}\n');
    try {
      execFileSync(tscPath, [sourcePath, "--ignoreConfig", "--module", "esnext", "--target", "es2022", "--outDir", temporary, "--skipLibCheck"], { encoding: "utf8" });
    } catch (error) {
      throw new Error(`Cannot compile upstream Generative UI vocabulary: ${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? error.message}`);
    }
    const rules = JSON.parse(execFileSync(process.execPath, [
      "--input-type=module", "-e",
      "const upstream = await import(process.argv[1]); console.log(JSON.stringify(Object.entries(upstream.generativeUiVocabularyCss).map(([selector, properties]) => [selector, properties, upstream.isDeclarationBlock(properties)])));",
      pathToFileURL(modulePath).href,
    ], { encoding: "utf8" }));
    const scope = selector => selector.split(",").map(s => `.agent-ui-conversation ${s.trim()}`).join(", ");
    const declaration = (selector, properties) => `${scope(selector)} {\n${Object.entries(properties).map(([k,v]) => `  ${k}: ${v};`).join("\n")}\n}`;
    css = rules.map(([selector, properties, isDeclarationBlock]) =>
      isDeclarationBlock ? declaration(selector, properties) :
      `${selector} {\n${Object.entries(properties).map(([s,p]) => declaration(s,p).split("\n").map(line => `  ${line}`).join("\n")).join("\n\n")}\n}`,
    ).join("\n\n") + "\n";
  } finally { await rm(temporary, { recursive: true, force: true }); }

  const itemRoot = path.join(root, "packages/source-registry/registry/items");
  const directory = path.join(itemRoot, "agent-component-assistant-ui-generative-ui/files/agent-ui/vendor/assistant-ui/generative-ui");
  const hash = value => createHash("sha256").update(value).digest("hex");
  const provenance = JSON.stringify({
    schemaVersion: 1, project: "assistant-ui/assistant-ui", revision, license: "MIT",
    packages: { [packageName]: version },
    files: [
      { upstreamPath: componentPath, localPath: "styled-generative-ui.tsx", upstreamSha256: hash(component), installedSha256: hash(component), adaptations: [] },
      { upstreamPath: cssPath, localPath: "generative-ui.css", upstreamSha256: hash(cssSource), installedSha256: hash(css), adaptations: ["official vocabulary CSS serialization", "mechanical selector scoping only: .agent-ui-conversation"] },
    ], patches: [],
  }, null, 2) + "\n";
  const generated = new Map([
    [path.join(directory, "styled-generative-ui.tsx"), component],
    [path.join(directory, "generative-ui.css"), css],
    [path.join(directory, "UPSTREAM.json"), provenance],
  ]);
  const items = await Promise.all(["agent-component-assistant-ui-generative-ui", "integration-generative-ui"].map(async id => {
    const itemPath = path.join(itemRoot, id, "item.json");
    return { id, itemPath, item: JSON.parse(await readFile(itemPath, "utf8")) };
  }));
  const generatedChanged = (await Promise.all([...generated].map(async ([filename, content]) =>
    !(await previousContent(filename))?.equals(Buffer.from(content))))).some(Boolean);
  for (const { id, itemPath, item } of items) {
    const changed = item.packages?.[packageName] !== version || item.upstream?.revision !== revision ||
      (id === "agent-component-assistant-ui-generative-ui" && generatedChanged);
    if (changed) item.version = nextPatch(item.version);
    item.packages[packageName] = version;
    item.upstream.revision = revision;
    await writeChanged(itemPath, JSON.stringify(item, null, 2) + "\n");
  }
  for (const [filename, content] of generated) await writeChanged(filename, content);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  await main({ revision: option("--revision", args), repo: option("--repo", args) ?? process.env.ASSISTANT_UI_REPO ?? path.resolve(defaultRoot, "../assistant-ui") });
}
