import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const exampleRoot = path.join(workspaceRoot, "examples/agent-frontend");
const pluginRoot = path.join(exampleRoot, "plugins");
const coreRoot = path.join(workspaceRoot, "packages/runtime-core");
const adapterRoot = path.join(workspaceRoot, "packages/runtime-agui");
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
]);
type PackageManifest = Record<string, Record<string, string> | undefined>;

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

async function packageSourceViolations(
  packageRoot: string,
  packageName: "runtime-core" | "runtime-agui",
): Promise<string[]> {
  const violations: string[] = [];
  for (const filename of await sourceFiles(path.join(packageRoot, "src"))) {
    const relative = path.relative(workspaceRoot, filename).split(path.sep).join("/");
    for (const specifier of moduleReferences(await readFile(filename, "utf8"))) {
      if (targetsExample(filename, specifier)) {
        violations.push(`${relative}: ${packageName} imports example ${specifier}`);
      }
      if (packageName === "runtime-core" && targetsPlugin(filename, specifier)) {
        violations.push(`${relative}: runtime-core imports plugin ${specifier}`);
      }
      if (
        packageName === "runtime-core" &&
        (specifier === "@agent-ui/runtime-agui" ||
          specifier.startsWith("@agent-ui/runtime-agui/"))
      ) {
        violations.push(`${relative}: runtime-core imports runtime-agui ${specifier}`);
      }
    }
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

  it("keeps both runtime packages independent from the example and plugins", async () => {
    expect([
      ...await packageSourceViolations(coreRoot, "runtime-core"),
      ...await packageSourceViolations(adapterRoot, "runtime-agui"),
    ]).toEqual([]);
  });

  it("does not keep compatibility copies in the generated app", async () => {
    expect(await pathExists(path.join(exampleRoot, "runtime/core"))).toBe(false);
    expect(await pathExists(path.join(exampleRoot, "runtime/ag-ui"))).toBe(false);
  });
});
