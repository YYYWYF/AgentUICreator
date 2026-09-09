import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(projectRoot, "../..");
const registryRoot = path.join(workspaceRoot, "packages/source-registry/registry");

async function collectFiles(
  root: string,
  predicate: (filePath: string) => boolean,
): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if ([
        "node_modules",
        ".git",
        ".pnpm-store",
        ".venv",
        "dist",
        "build",
      ].includes(entry.name)) return [];
      return collectFiles(entryPath, predicate);
    }
    return entry.isFile() && predicate(entryPath) ? [entryPath] : [];
  }));
  return nested.flat().sort();
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(
    /(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/gu,
  )].map((match) => match[1] ?? "");
}

describe("Agent UI component source policy", () => {
  it("keeps assistant-ui out of generated and Registry imports", async () => {
    const sourceFiles = [
      ...await collectFiles(path.join(projectRoot, "agent-ui"), (filePath) => /\.[cm]?[jt]sx?$/u.test(filePath)),
      ...await collectFiles(registryRoot, (filePath) => /\.[cm]?[jt]sx?$/u.test(filePath)),
    ];
    for (const filePath of sourceFiles) {
      for (const specifier of importSpecifiers(await readFile(filePath, "utf8"))) {
        expect(specifier, filePath).not.toMatch(/^@?assistant-ui(?:\/|$)/u);
      }
    }
  });

  it("keeps forbidden Agent Component dependencies out of package manifests", async () => {
    const packageFiles = await collectFiles(workspaceRoot, (filePath) => {
      const relative = path.relative(workspaceRoot, filePath);
      return path.basename(filePath) === "package.json" &&
        !relative.split(path.sep).includes("node_modules");
    });
    for (const filePath of packageFiles) {
      const manifest = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
      for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const dependencies = manifest[field];
        if (dependencies === undefined || dependencies === null || typeof dependencies !== "object") continue;
        for (const dependency of Object.keys(dependencies)) {
          expect(dependency, filePath).not.toMatch(/^@?assistant-ui(?:\/|$)/u);
          expect(dependency, filePath).not.toBe("tailwindcss");
          expect(dependency, filePath).not.toBe("class-variance-authority");
          expect(dependency, filePath).not.toBe("lucide-react");
          expect(dependency, filePath).not.toMatch(/^@radix-ui\//u);
        }
      }
    }
  });

  it("limits the Composer to React and local Agent UI source", async () => {
    const composerPath = path.join(
      registryRoot,
      "items/agent-component-composer/files/components/composer.tsx",
    );
    const source = await readFile(composerPath, "utf8");
    const specifiers = importSpecifiers(source);
    expect(specifiers).toContain("react");
    expect(specifiers.every((specifier) => specifier === "react" || specifier.startsWith(".")))
      .toBe(true);
    expect(source).not.toMatch(/className\s*=\s*["']/u);
    expect(source).not.toMatch(/@base-ui\/react|@radix-ui\/|@ant-design\/x|\bantd\b|tailwindcss|class-variance-authority/u);
  });

  it("keeps the Sender plugin implementation free of Ant Design UI", async () => {
    const senderRoot = path.join(projectRoot, "plugins/antd-x-sender");
    const senderFiles = await collectFiles(
      senderRoot,
      (filePath) => /\.(?:css|tsx?)$/u.test(filePath),
    );
    for (const senderPath of senderFiles) {
      const source = (await readFile(senderPath, "utf8"))
        .replaceAll('"antd-x-sender"', '""')
        .replaceAll("'antd-x-sender'", "''");
      expect(source, senderPath).not.toMatch(
        /@ant-design\/x|@ant-design\/icons|from\s*["']antd["']|\.ant-|antd-/u,
      );
    }
    const senderCss = await readFile(path.join(senderRoot, "styles.css"), "utf8");
    expect(senderCss).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch)\s*\(/iu);
  });
});
