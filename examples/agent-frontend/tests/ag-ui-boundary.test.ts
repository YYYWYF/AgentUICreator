import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const adapterRoot = path.join(projectRoot, "runtime/ag-ui");
const ignoredDirectories = new Set(["node_modules", "dist", ".git", ".creator", "coverage"]);

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

  it("allows SDK imports only in runtime/ag-ui and keeps adapter imports out of core and plugins", async () => {
    const violations: string[] = [];
    for (const filename of await sourceFiles(projectRoot)) {
      const relative = path.relative(projectRoot, filename).split(path.sep).join("/");
      const inAdapter = filename.startsWith(`${adapterRoot}${path.sep}`);
      const protectedLayer = /^(framework|runtime\/(core|plugins)|plugins|services|app-ui)\//.test(relative);
      for (const specifier of moduleReferences(await readFile(filename, "utf8"))) {
        if (specifier.startsWith("@ag-ui/") && !inAdapter) {
          violations.push(`${relative}: SDK import ${specifier}`);
        }
        const resolved = path.resolve(path.dirname(filename), specifier);
        if (protectedLayer && specifier.startsWith(".") &&
            (resolved === adapterRoot || resolved.startsWith(`${adapterRoot}${path.sep}`))) {
          violations.push(`${relative}: adapter import ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
