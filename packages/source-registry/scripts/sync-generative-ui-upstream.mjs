import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const repo = process.env.ASSISTANT_UI_REPO ?? path.resolve(root, "../assistant-ui");
const target = JSON.parse(await readFile(path.join(root, "assistant-ui-upgrade-target.json"), "utf8"));
const revision = target.packageRevisions["@assistant-ui/react-generative-ui"];
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Exact release revision required");
const source = name => execFileSync("git", ["-C", repo, "show", `${revision}:${name}`], { encoding: "utf8" });
const componentPath = "packages/ui/src/components/react/assistant-ui/elements/generative-ui.tsx";
const cssPath = "packages/ui/src/lib/generative-ui-vocabulary-css.ts";
const component = source(componentPath);
const cssSource = source(cssPath);
const temporary = await mkdtemp(path.join(tmpdir(), "generative-ui-source-"));
let css;
try {
  const modulePath = path.join(temporary, "vocabulary.mts");
  await writeFile(modulePath, cssSource);
  const upstream = await import(pathToFileURL(modulePath).href);
  // Scope every selector, including comma-separated and media-query selectors.
  const scope = selector => selector.split(",").map(s => `.agent-ui-conversation ${s.trim()}`).join(", ");
  const declaration = (selector, properties) => `${scope(selector)} {\n${Object.entries(properties).map(([k,v]) => `  ${k}: ${v};`).join("\n")}\n}`;
  css = Object.entries(upstream.generativeUiVocabularyCss).map(([selector, properties]) =>
    upstream.isDeclarationBlock(properties) ? declaration(selector, properties) :
    `${selector} {\n${Object.entries(properties).map(([s,p]) => declaration(s,p).split("\n").map(line => `  ${line}`).join("\n")).join("\n\n")}\n}`,
  ).join("\n\n") + "\n";
} finally { await rm(temporary, { recursive: true, force: true }); }
const itemRoot = path.join(root, "packages/source-registry/registry/items/agent-component-assistant-ui-generative-ui");
const directory = path.join(itemRoot, "files/agent-ui/vendor/assistant-ui/generative-ui");
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "styled-generative-ui.tsx"), component);
await writeFile(path.join(directory, "generative-ui.css"), css);
const hash = value => createHash("sha256").update(value).digest("hex");
await writeFile(path.join(directory, "UPSTREAM.json"), JSON.stringify({
  schemaVersion: 1, project: "assistant-ui/assistant-ui", revision, license: "MIT",
  packages: { "@assistant-ui/react-generative-ui": target.packages["@assistant-ui/react-generative-ui"] },
  files: [
    { upstreamPath: componentPath, localPath: "styled-generative-ui.tsx", upstreamSha256: hash(component), installedSha256: hash(component), adaptations: [] },
    { upstreamPath: cssPath, localPath: "generative-ui.css", upstreamSha256: hash(cssSource), installedSha256: hash(css), adaptations: ["official vocabulary CSS serialization", "mechanical selector scoping only: .agent-ui-conversation"] },
  ], patches: [],
}, null, 2) + "\n");
