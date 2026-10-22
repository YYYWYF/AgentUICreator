import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readFile, stat, writeFile, rm } from "node:fs/promises";
import test from "node:test";
import ts from "typescript-ui-audit";
import { relativeModuleSpecifier, prepareTypeScriptAuthoring } from "./prepare-typescript-authoring.mjs";

const workspace = fileURLToPath(new URL("..", import.meta.url));
const root = path.join(workspace, "packages/plugins");

test("authoring module specifiers preserve spaces and Unicode on Windows", () => {
  assert.equal(relativeModuleSpecifier("C:\\Work Space\\工程\\.typecheck\\bridge.ts", "C:\\Work Space\\工程\\src\\owner.tsx", path.win32), "../src/owner.js");
  assert.equal(relativeModuleSpecifier("/work space/工程/.typecheck/bridge.ts", "/work space/工程/src/owner.tsx", path.posix), "../src/owner.js");
});

test("authoring refresh preserves unchanged files and canonical owners while removing obsolete bridges", async () => {
  await prepareTypeScriptAuthoring();
  const generated = path.join(root, ".typecheck/service-map.ts");
  const stale = path.join(root, ".typecheck/__obsolete-fixture.ts");
  const owner = path.join(root, "src/plugins/add-attachment-action/upstream/assistant-ui/components/assistant-ui/elements/attachment.aui.tsx");
  const before = await stat(generated);
  const original = await readFile(owner);
  await writeFile(stale, "export const obsolete = true;\n");
  try {
    await prepareTypeScriptAuthoring();
    assert.equal((await stat(generated)).mtimeMs, before.mtimeMs);
    assert.deepEqual(await readFile(owner), original);
    assert.equal(existsSync(stale), false);
  } finally { await rm(stale, { force: true }); }
});

test("editor language service resolves canonical sources and still rejects invalid types and exports", () => {
  const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  const virtualFile = path.join(root, "src/authoring-negative-control.ts");
  // The negative control imports through an actual canonical Plugin, so both
  // the original template's relative imports and public types are checked.
  const control = 'import { conversationThreadListPlugin } from "./plugins/conversation-thread-list/adapters/project/definition";\nimport type { ThisExportMustNotExist } from "./plugins/conversation-thread-list/adapters/project/definition";\nconst broken: typeof conversationThreadListPlugin.manifest = { id: 123 };\nimport type { ConversationThreadListPluginProps } from "./plugins/conversation-thread-list/adapters/presentation/conversation-thread-list";\nconst wrongProps: ConversationThreadListPluginProps = { serviceAvailable: 123 };\nimport type { MissingModule } from "./this-module-does-not-exist";\n';
  const host = {
    getScriptFileNames: () => [...parsed.fileNames, virtualFile],
    getScriptVersion: () => "1",
    getScriptSnapshot: name => name === virtualFile ? ts.ScriptSnapshot.fromString(control) : existsSync(name) ? ts.ScriptSnapshot.fromString(readFileSync(name, "utf8")) : undefined,
    getCurrentDirectory: () => root,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: name => name === virtualFile || ts.sys.fileExists(name),
    readFile: name => name === virtualFile ? control : ts.sys.readFile(name),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    realpath: ts.sys.realpath,
  };
  const service = ts.createLanguageService(host);
  try {
    for (const relative of [
      "src/plugins/add-attachment-action/upstream/assistant-ui/components/assistant-ui/elements/attachment.aui.tsx",
      "src/plugins/conversation-thread-list/adapters/project/definition.ts",
      "src/plugins/conversation-thread-list/adapters/package-definition.ts",
    ]) {
      const name = path.join(root, relative);
      assert.ok(existsSync(name), `Missing canonical owner: ${relative}`);
      const diagnostics = service.getSemanticDiagnostics(name);
      assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: name => name, getCurrentDirectory: () => root, getNewLine: () => "\n" }));
    }
    const diagnostics = service.getSemanticDiagnostics(virtualFile);
    assert.ok(diagnostics.filter(error => error.code === 2322).length >= 2, "real manifest and component prop types must reject invalid values");
    assert.ok(diagnostics.some(error => error.code === 2307), "unresolved modules must remain errors");
    assert.ok(diagnostics.some(error => [2305,2614,2724].includes(error.code) && ts.flattenDiagnosticMessageText(error.messageText, " ").includes("ThisExportMustNotExist")), "missing exports must remain errors");
  } finally { service.dispose(); }
});
