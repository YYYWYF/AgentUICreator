import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { JSDOM } from "jsdom";
import ts from "typescript-ui-audit";
const root = new URL("../", import.meta.url);
for (const name of ["agent-ui.js", "agent-ui.es.js"]) {
  const script = await readFile(new URL(`dist/${name}`, root), "utf8");
  assert(!script.includes("__AGENT_UI_BUNDLED_PLUGIN_CSS__"));
  assert(!script.includes("process.env.NODE_ENV"));
  const ast = ts.createSourceFile(name, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imports = [];
  const visit = node => {
    if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier) ||
      (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)) imports.push(node.getText(ast).slice(0, 100));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.deepEqual(imports, [], `${name} must not import React or any external module`);
}
assert(!(await readdir(new URL("dist/", root))).some(name => name.endsWith(".css")), "CSS must be inside Shadow DOM only");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only", url: "http://localhost/" });
Object.assign(dom.window, { TransformStream, ReadableStream, WritableStream, TextEncoder, TextDecoder, fetch, Request, Response, Headers });
const standalone = await readFile(new URL("dist/agent-ui.js", root), "utf8");
try { dom.window.eval(standalone); } catch (error) { throw new Error(`Standalone registration failed: ${error.message}`); }
const first = dom.window.customElements.get("agent-ui");
try { dom.window.eval(standalone); } catch (error) { throw new Error(`Standalone registration failed: ${error.message}`); }
assert.equal(dom.window.customElements.get("agent-ui"), first);
const element = dom.window.document.createElement("agent-ui");
assert(element.shadowRoot);
assert(element.shadowRoot.querySelector("style").textContent.includes("agent-ui-root"));
assert(element.shadowRoot.querySelectorAll("style")[1].textContent.length > 0, "Plugin styles must be injected");
assert.equal(dom.window.document.head.querySelector("style"), null);
dom.window.close();
console.log("Standalone/ESM distribution, registration and Shadow CSS checks passed (no UI acceptance).");
