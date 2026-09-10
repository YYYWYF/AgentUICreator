import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const exampleRoot = path.join(workspaceRoot, "examples/agent-frontend");
const pluginRoot = path.join(exampleRoot, "plugins");
const coreRoot = path.join(workspaceRoot, "packages/runtime-core");
const adapterRoot = path.join(workspaceRoot, "packages/runtime-agui");
const reactRuntimeRoot = path.join(workspaceRoot, "packages/runtime-react");
const creatorRoots = [
  path.join(workspaceRoot, "packages/creator"),
  path.join(workspaceRoot, "packages/creator-python"),
];
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
]);
type PackageManifest = Record<string, Record<string, string> | undefined>;
type RuntimePackageName =
  | "runtime-core"
  | "runtime-agui"
  | "runtime-react";

async function pathExists(filename: string): Promise<boolean> {
  return access(filename).then(
    () => true,
    () => false,
  );
}

async function readPackage(packageRoot: string): Promise<PackageManifest> {
  return JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as PackageManifest;
}

function dependencyNames(manifest: PackageManifest): string[] {
  return [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ].flatMap((field) => Object.keys(manifest[field] ?? {}));
}

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
  return specifier === "@agent-ui/example-agent-frontend" ||
    specifier.startsWith("@agent-ui/example-agent-frontend/") ||
    specifier.includes("examples/agent-frontend") ||
    resolvesInside(filename, specifier, exampleRoot);
}

function targetsPlugin(filename: string, specifier: string): boolean {
  return specifier.startsWith("@agent-ui/plugin-") ||
    specifier.includes("/plugins/") ||
    resolvesInside(filename, specifier, pluginRoot);
}

function targetsCreator(filename: string, specifier: string): boolean {
  return specifier === "@agent-ui/creator" ||
    specifier.startsWith("@agent-ui/creator/") ||
    specifier.startsWith("@agent-ui/creator-") ||
    specifier.includes("packages/creator") ||
    creatorRoots.some((root) => resolvesInside(filename, specifier, root));
}

function sourceViolations(
  filename: string,
  source: string,
  packageName: RuntimePackageName,
): string[] {
  const relative = path.relative(workspaceRoot, filename).split(path.sep).join("/");
  const violations: string[] = [];

  for (const specifier of moduleReferences(source)) {
    if (targetsExample(filename, specifier)) {
      violations.push(`${relative}: ${packageName} imports example ${specifier}`);
    }
    if (targetsPlugin(filename, specifier)) {
      violations.push(`${relative}: ${packageName} imports plugin ${specifier}`);
    }
    if (packageName === "runtime-react" && targetsCreator(filename, specifier)) {
      violations.push(`${relative}: runtime-react imports Creator ${specifier}`);
    }
    if (
      packageName === "runtime-core" &&
      (specifier === "@agent-ui/runtime-agui" ||
        specifier.startsWith("@agent-ui/runtime-agui/"))
    ) {
      violations.push(`${relative}: runtime-core imports runtime-agui ${specifier}`);
    }
  }

  return violations;
}

async function packageSourceViolations(
  packageRoot: string,
  packageName: RuntimePackageName,
): Promise<string[]> {
  const violations: string[] = [];
  for (const filename of await sourceFiles(path.join(packageRoot, "src"))) {
    violations.push(...sourceViolations(
      filename,
      await readFile(filename, "utf8"),
      packageName,
    ));
  }
  return violations;
}

describe("runtime package dependency direction", () => {
  it("allows runtime-agui to depend on runtime-core without reverse dependencies", async () => {
    const coreDependencies = dependencyNames(await readPackage(coreRoot));
    const adapterDependencies = dependencyNames(await readPackage(adapterRoot));

    expect(adapterDependencies).toContain("@agent-ui/runtime-core");
    expect(adapterDependencies).not.toContain("@agent-ui/example-agent-frontend");
    expect(coreDependencies).not.toContain("@agent-ui/runtime-agui");
    expect(coreDependencies).not.toContain("@agent-ui/example-agent-frontend");
    expect(coreDependencies.filter((name) => name.startsWith("@agent-ui/plugin-"))).toEqual([]);
  });

  it("keeps Runtime packages independent from the example, plugins, and Creator", async () => {
    expect([
      ...await packageSourceViolations(coreRoot, "runtime-core"),
      ...await packageSourceViolations(adapterRoot, "runtime-agui"),
      ...await packageSourceViolations(reactRuntimeRoot, "runtime-react"),
    ]).toEqual([]);
  });

  it("detects forbidden runtime-react imports", () => {
    const filename = path.join(reactRuntimeRoot, "src/illegal-import.ts");
    const exampleSpecifier = "../../../examples/agent-frontend/src/index";

    expect(sourceViolations(
      filename,
      `import example from "${exampleSpecifier}";`,
      "runtime-react",
    )).toEqual([
      `packages/runtime-react/src/illegal-import.ts: runtime-react imports example ${exampleSpecifier}`,
    ]);
  });

  it("does not keep official Runtime compatibility copies in the generated app", async () => {
    expect(await pathExists(path.join(exampleRoot, "runtime/core"))).toBe(false);
    expect(await pathExists(path.join(exampleRoot, "runtime/ag-ui"))).toBe(false);
    expect(await pathExists(path.join(exampleRoot, "runtime/layout"))).toBe(false);
  });

  it("keeps the development Source Registry out of the application runtime graph", async () => {
    const runtimeRoots = ["src", "runtime", "plugins", "agent-ui"].map((directory) =>
      path.join(exampleRoot, directory),
    );
    const violations: string[] = [];
    for (const root of runtimeRoots) {
      for (const filename of await sourceFiles(root)) {
        for (const specifier of moduleReferences(await readFile(filename, "utf8"))) {
          if (
            specifier === "@agent-ui/source-registry" ||
            specifier.startsWith("@agent-ui/source-registry/")
          ) {
            violations.push(path.relative(exampleRoot, filename));
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
