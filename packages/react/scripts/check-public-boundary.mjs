import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function collectDeclarationFiles(current) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) return collectDeclarationFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith(".d.ts") ? [absolutePath] : [];
  }));
  return files.flat();
}

let declarationFiles;
try {
  declarationFiles = await collectDeclarationFiles(declarationRoot);
} catch (error) {
  if (error?.code === "ENOENT") {
    console.error("@agent-ui/react public declaration boundary: dist is missing; build the package first.");
    process.exit(1);
  }
  throw error;
}

if (declarationFiles.length === 0) {
  console.error("@agent-ui/react public declaration boundary: no dist/**/*.d.ts files found.");
  process.exit(1);
}

const violations = [];
for (const filePath of declarationFiles.sort()) {
  const source = await readFile(filePath, "utf8");
  for (const token of forbiddenTokens) {
    if (source.includes(token)) {
      violations.push(`${path.relative(packageRoot, filePath)} contains ${token}`);
    }
  }
}

if (violations.length > 0) {
  console.error(["@agent-ui/react public declaration boundary failed:", ...violations].join("\n"));
  process.exit(1);
}

console.log(`@agent-ui/react public declaration boundary: OK (${declarationFiles.length} declarations)`);
