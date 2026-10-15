import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const examplesRoot = path.join(workspaceRoot, "examples");
const pluginRoot = path.join(examplesRoot, "creator-host-sandbox/src/agent-ui/plugins");
const creatorRoots = [
  path.join(workspaceRoot, "packages/creator"),
  path.join(workspaceRoot, "packages/creator/python"),
];
const runtimePackageRoots = [
  path.join(workspaceRoot, "packages/core"),
  path.join(workspaceRoot, "packages/runtime"),
];
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
]);

type PackageManifest = Record<string, Record<string, string> | undefined>;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : sourceFiles(filename);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [filename] : [];
  }))).flat();
}

function dependencyNames(manifest: PackageManifest): string[] {
  return [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ].flatMap((field) => Object.keys(manifest[field] ?? {}));
}

function moduleReferences(source: string): string[] {
  const tokens = [...source.matchAll(
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\w$]+|[^\s]/g,
  )]
    .map((match) => match[0])
    .filter((token) => !token.startsWith("//") && !token.startsWith("/*"));

  return tokens.flatMap((token, index) => {
    if (!/^["'`]/.test(token)) return [];
    const previous = tokens[index - 1];
    const beforePrevious = tokens[index - 2];
    return previous === "from" || previous === "import" ||
      (previous === "(" && (beforePrevious === "import" || beforePrevious === "require"))
      ? [token.slice(1, -1)]
      : [];
  });
}

function isInside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function resolvesInside(
  filename: string,
  specifier: string,
  root: string,
): boolean {
  return specifier.startsWith(".") &&
    isInside(path.resolve(path.dirname(filename), specifier), root);
}

function targetsExample(filename: string, specifier: string): boolean {
  return specifier === "@za38.03/agent-ui-creator-host-sandbox" ||
    specifier.startsWith("@za38.03/agent-ui-creator-host-sandbox/") ||
    specifier.includes("examples/") ||
    resolvesInside(filename, specifier, examplesRoot);
}

function targetsPlugin(filename: string, specifier: string): boolean {
  return specifier.startsWith("@agent-ui/plugin-") ||
    specifier.startsWith("plugins/") ||
    specifier.includes("/plugins/") ||
    resolvesInside(filename, specifier, pluginRoot);
}

function targetsCreator(filename: string, specifier: string): boolean {
  return specifier === "@za38.03/agent-ui-creator" ||
    specifier.startsWith("@za38.03/agent-ui-creator/") ||
    specifier.startsWith("@za38.03/agent-ui-creator-") ||
    specifier.includes("packages/creator") ||
    creatorRoots.some((root) => resolvesInside(filename, specifier, root));
}

function targetsRuntimePackage(filename: string, specifier: string): boolean {
  return ["@za38.03/agent-ui-core", "@za38.03/agent-ui-runtime"].some(
    (packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`),
  ) || runtimePackageRoots.some(
    (root) => resolvesInside(filename, specifier, root),
  );
}

function targetsMode(specifier: string): boolean {
  return specifier.includes("agent-ui-mode") || specifier.includes("mode-shell");
}

function sourceViolations(filename: string, source: string): string[] {
  const relative = path.relative(packageRoot, filename).split(path.sep).join("/");
  const violations: string[] = [];

  for (const specifier of moduleReferences(source)) {
    if (targetsExample(filename, specifier)) {
      violations.push(`${relative}: renderer imports example ${specifier}`);
    } else if (targetsPlugin(filename, specifier)) {
      violations.push(`${relative}: renderer imports plugin ${specifier}`);
    } else if (targetsCreator(filename, specifier)) {
      violations.push(`${relative}: renderer imports Creator ${specifier}`);
    } else if (targetsRuntimePackage(filename, specifier)) {
      violations.push(`${relative}: renderer imports ${specifier}`);
    } else if (targetsMode(specifier)) {
      violations.push(`${relative}: renderer imports Mode ${specifier}`);
    }
  }

  return violations;
}

describe("renderer package boundary", () => {
  it("keeps package dependencies independent from Agent UI applications and packages", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as PackageManifest;

    expect(
      dependencyNames(manifest).filter((name) => name.startsWith("@za38.03/agent-ui-")),
    ).toEqual([]);
  });

  it("keeps source imports independent from examples, plugins, Creator, Mode, and other Runtime packages", async () => {
    const violations: string[] = [];
    for (const filename of await sourceFiles(path.join(packageRoot, "src"))) {
      violations.push(...sourceViolations(
        filename,
        await readFile(filename, "utf8"),
      ));
    }

    expect(violations).toEqual([]);
  });

  it("detects forbidden source imports", () => {
    const filename = path.join(packageRoot, "src/illegal-import.ts");
    const exampleSpecifier = "../../../examples/creator-host-sandbox/src/index";
    const runtimeSpecifier = "../../runtime/src/index";

    expect(sourceViolations(
      filename,
      [
        `import example from "${exampleSpecifier}";`,
        'import plugin from "@agent-ui/plugin-example";',
        'import creator from "@za38.03/agent-ui-creator";',
        `import runtime from "${runtimeSpecifier}";`,
        'import mode from "./mode-shell";',
      ].join("\n"),
    )).toEqual([
      `src/illegal-import.ts: renderer imports example ${exampleSpecifier}`,
      "src/illegal-import.ts: renderer imports plugin @agent-ui/plugin-example",
      "src/illegal-import.ts: renderer imports Creator @za38.03/agent-ui-creator",
      `src/illegal-import.ts: renderer imports ${runtimeSpecifier}`,
      "src/illegal-import.ts: renderer imports Mode ./mode-shell",
    ]);
  });
});
