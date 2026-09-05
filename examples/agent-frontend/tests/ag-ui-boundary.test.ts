import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const projectRoot = path.join(workspaceRoot, "examples/agent-frontend");
const coreRoot = path.join(workspaceRoot, "packages/runtime-core");
const adapterRoot = path.join(workspaceRoot, "packages/runtime-agui");
const protectedRoots = [
  coreRoot,
  path.join(projectRoot, "framework"),
  path.join(projectRoot, "runtime"),
  path.join(projectRoot, "plugins"),
  path.join(projectRoot, "services"),
  path.join(projectRoot, "src"),
];
const ignoredDirectories = new Set(["node_modules", "dist", ".git", ".creator", "coverage"]);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  return (await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : sourceFiles(filename);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [filename] : [];
  }))).flat();
}

function moduleReferences(source: string): string[] {
  // Tokenize comments and quoted strings first, so comments cannot fake imports
  // and URLs inside strings do not get mistaken for line comments.
  const tokens = [...source.matchAll(
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\w$]+|[^\s]/g,
  )].map((match) => match[0]).filter((token) => !token.startsWith("//") && !token.startsWith("/*"));
  return tokens.flatMap((token, index) => {
    if (!/^["'`]/.test(token)) return [];
    const previous = tokens[index - 1];
    const beforePrevious = tokens[index - 2];
    return previous === "from" || previous === "import" ||
      (previous === "(" && (beforePrevious === "import" || beforePrevious === "require"))
      ? [token.slice(1, -1)] : [];
  });
}

describe("generated app AG-UI dependency boundary", () => {
  it("detects imports, re-exports, dynamic imports and require without matching comments", () => {
    expect(moduleReferences(`
      // import "@ag-ui/ignored";
      /* export * from "@ag-ui/also-ignored"; */
      import type { Message } from "@ag-ui/core";
      export * from "@ag-ui/client";
      import "@ag-ui/side-effect";
      const module = import("@ag-ui/dynamic");
      const legacy = require("@ag-ui/legacy");
    `)).toEqual(["@ag-ui/core", "@ag-ui/client", "@ag-ui/side-effect", "@ag-ui/dynamic", "@ag-ui/legacy"]);
  });

  it("keeps AG-UI SDK imports inside runtime-agui", async () => {
    const violations: string[] = [];
    for (const filename of (await Promise.all(
      protectedRoots.map(sourceFiles),
    )).flat()) {
      const relative = path.relative(workspaceRoot, filename).split(path.sep).join("/");
      for (const specifier of moduleReferences(await readFile(filename, "utf8"))) {
        if (specifier.startsWith("@ag-ui/")) {
          violations.push(`${relative}: SDK import ${specifier}`);
        }
        if (
          filename.startsWith(`${coreRoot}${path.sep}`) &&
          specifier.startsWith("@agent-ui/runtime-agui")
        ) {
          violations.push(`${relative}: core imports adapter ${specifier}`);
        }
        if (
          /\/examples\/agent-frontend\/(framework|plugins)\//.test(filename) &&
          specifier.startsWith("@agent-ui/runtime-agui")
        ) {
          violations.push(`${relative}: plugin layer imports adapter ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("enforces package dependency ownership and direction", async () => {
    const readPackage = async (filename: string): Promise<Record<string, unknown>> =>
      JSON.parse(await readFile(filename, "utf8")) as Record<string, unknown>;
    const corePackage = await readPackage(path.join(coreRoot, "package.json"));
    const adapterPackage = await readPackage(path.join(adapterRoot, "package.json"));
    const appPackage = await readPackage(path.join(projectRoot, "package.json"));
    const dependencyNames = (manifest: Record<string, unknown>): string[] =>
      [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]
        .flatMap((field) => Object.keys(
          (manifest[field] as Record<string, string> | undefined) ?? {},
        ));

    expect(dependencyNames(corePackage)).not.toContain("@agent-ui/runtime-agui");
    expect(dependencyNames(corePackage)).not.toContain("react");
    expect(dependencyNames(corePackage).filter((name) => name.startsWith("@ag-ui/"))).toEqual([]);
    expect(dependencyNames(appPackage).filter((name) => name.startsWith("@ag-ui/"))).toEqual([]);
    expect(appPackage.dependencies).toMatchObject({
      "@agent-ui/runtime-agui": "workspace:^",
      "@agent-ui/runtime-core": "workspace:^",
    });
    expect(adapterPackage.dependencies).toMatchObject({
      "@ag-ui/client": "0.0.59",
      "@ag-ui/core": "0.0.59",
    });
    expect(adapterPackage.peerDependencies).toMatchObject({
      "@agent-ui/runtime-core": "^0.1.0",
    });
  });

  it("uses only the runtime package public entry points across package boundaries", async () => {
    const violations: string[] = [];
    for (const filename of await sourceFiles(adapterRoot)) {
      const relative = path.relative(workspaceRoot, filename).split(path.sep).join("/");
      for (const specifier of moduleReferences(await readFile(filename, "utf8"))) {
        if (
          specifier.startsWith("@agent-ui/runtime-core/") ||
          specifier.includes("runtime-core/src") ||
          specifier.includes("runtime-core/dist")
        ) {
          violations.push(`${relative}: private core import ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
