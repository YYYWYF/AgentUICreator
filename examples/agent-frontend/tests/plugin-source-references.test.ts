import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inspectPluginSourceReferences } from "../scripts/ui-project/plugin-source-references";

const temporaryProjects: string[] = [];

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "plugin-references-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "plugins", "target"), { recursive: true });
  await mkdir(path.join(projectRoot, "plugins", "consumer"));
  await mkdir(path.join(projectRoot, "services"));
  await mkdir(path.join(projectRoot, "src"));
  await writeFile(
    path.join(projectRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2022",
        jsx: "react-jsx",
        baseUrl: ".",
        paths: { "@target/*": ["plugins/target/*"] },
      },
      include: ["services/**/*.ts", "src/**/*.ts"],
    }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "target", "index.ts"),
    "export const targetService = true;\n",
  );
  await writeFile(
    path.join(projectRoot, "plugins", "target", "internal.ts"),
    'export const ownId = "target-plugin";\n',
  );
  await writeFile(
    path.join(projectRoot, "plugins", "target", "theme.css"),
    ".target { color: red; }\n",
  );
  await writeFile(
    path.join(projectRoot, "plugins", "consumer", "index.ts"),
    'import { targetService } from "@target/index";\nexport { targetService };\n',
  );
  await writeFile(
    path.join(projectRoot, "plugins", "consumer", "manifest.json"),
    JSON.stringify({ id: "consumer", peerPlugin: "target-plugin" }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "consumer", "styles.css"),
    '@import "../target/theme.css";\n',
  );
  await writeFile(
    path.join(projectRoot, "services", "selection.ts"),
    'export const selectedPluginId = "target-plugin";\n',
  );
  await writeFile(
    path.join(projectRoot, "src", "unrelated.ts"),
    'export const unrelated = "other-plugin";\n',
  );
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("inspectPluginSourceReferences", () => {
  it("uses TypeScript resolution and exact id literals while excluding the target itself", async () => {
    const projectRoot = await createProject();

    const result = await inspectPluginSourceReferences(
      projectRoot,
      "target-plugin",
      "target",
    );

    expect(result).toMatchObject({
      pluginId: "target-plugin",
      directory: "target",
      truncated: false,
      references: expect.arrayContaining([
        expect.objectContaining({
          path: "plugins/consumer/index.ts",
          kind: "module",
          value: "@target/index",
        }),
        expect.objectContaining({
          path: "plugins/consumer/manifest.json",
          kind: "plugin-id-manifest",
        }),
        expect.objectContaining({
          path: "plugins/consumer/styles.css",
          kind: "module",
          value: "../target/theme.css",
        }),
        expect.objectContaining({
          path: "services/selection.ts",
          kind: "plugin-id-literal",
        }),
      ]),
    });
    expect(
      result.references.some((reference) =>
        reference.path.startsWith("plugins/target/"),
      ),
    ).toBe(false);
  });
});
