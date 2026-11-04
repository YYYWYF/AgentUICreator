// @vitest-environment node
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import ts from "typescript-ui-audit";
import { formatProjectCode } from "../src/project/generated-code-format.mjs";
import { ensurePluginApplication } from "../src/project/plugin-application";
import { officialPackagePlugins } from "../src/source-catalog/index";
import { resourcePaths } from "../src/project/optional-resource-paths";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it("formats every installed Plugin application, including Host templates, without touching existing customizations", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "generated code 格式-"));
  roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await mkdir(path.join(root, "src/agent-ui"), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, ".agent-ui/project.json"), '{"mode":"platform","sourceRoot":"src/agent-ui"}');
  await symlink(path.join(repository, "examples/creator-host-sandbox/node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const context = { ...await resourcePaths(root), mode: "platform" as const };
  for (const official of officialPackagePlugins) {
    await ensurePluginApplication(root, official.pluginId, context);
  }
  let checked = 0;
  const inspect = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await inspect(file);
      else if (/\.tsx?$/u.test(entry.name)) {
        const source = await readFile(file, "utf8");
        expect(source, path.relative(root, file)).toBe(await formatProjectCode(source));
        const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        const imports = ast.statements.filter(ts.isImportDeclaration).map(node => (node.moduleSpecifier as ts.StringLiteral).text);
        expect(new Set(imports).size, file).toBe(imports.length);
        checked++;
      }
    }
  };
  await inspect(context.paths.sourceRoot);
  expect(checked).toBeGreaterThan(90);
  const custom = path.join(context.paths.pluginsRoot, "composer/index.tsx");
  const bytes = "// Keep user formatting and Windows line endings.\r\nexport const custom =  1;\r\n";
  await writeFile(custom, bytes);
  await ensurePluginApplication(root, "composer", context, { repair: true });
  expect(await readFile(custom, "utf8")).toBe(bytes);
}, 30000);

it("normalizes CRLF and preserves literal values, JSX attributes and non-identifier keys", async () => {
  const source = 'export const value = {"regular": "中文 \\"quoted\\"", "tool-name": "x", ["__proto__"]: "safe"};\r\nexport const Element = () => <span aria-label="测试">{value.regular}</span>;\r\n';
  const formatted = await formatProjectCode(source);
  expect(formatted).not.toContain("\r");
  expect(formatted).toContain("'tool-name'");
  expect(formatted).toContain("['__proto__']");
  expect(formatted).toContain("aria-label='测试'");
  expect(await formatProjectCode(formatted)).toBe(formatted);
});
