import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDeclarationGraph } from "./declaration-graph.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const declarationRoot = path.join(packageRoot, "dist");
const forbiddenTokens = [
  "@assistant-ui/",
  "AssistantUi",
  "ThreadPrimitive",
  "ComposerPrimitive",
  "MessagePrimitive",
  "useAui",
  "AuiConfig",
  "runtime-assistant-ui",
];

const entryPath = path.join(declarationRoot, "index.d.ts");
const { missing, reachable } = await buildDeclarationGraph(
  declarationRoot,
  entryPath,
);
if (missing.length > 0) {
  const details = missing.map(({ sourcePath, specifier }) =>
    `${path.relative(packageRoot, sourcePath)} cannot resolve ${specifier}`
  );
  console.error([
    "@agent-ui/runtime-conversation public declaration boundary failed:",
    ...details,
  ].join("\n"));
  process.exit(1);
}

const violations = [];
for (const filePath of [...reachable].sort()) {
  const source = await readFile(filePath, "utf8");
  for (const token of forbiddenTokens) {
    if (source.includes(token)) {
      violations.push(`${path.relative(packageRoot, filePath)} contains ${token}`);
    }
  }
}

if (violations.length > 0) {
  console.error(["@agent-ui/runtime-conversation public declaration boundary failed:", ...violations].join("\n"));
  process.exit(1);
}

console.log(`@agent-ui/runtime-conversation public declaration boundary: OK (${reachable.size} reachable declarations)`);
