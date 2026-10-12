import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, it } from "vitest";

import postcss from "postcss";

import { pluginResponsiveRisks, verifyPluginStyles } from "../../src/project/plugin-style-verifier";
import type { PluginAsset, ProjectIssue } from "../../src/project/types";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function inspect(styles: string, warnings: ProjectIssue[] = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-ui-plugin-css-"));
  temporaryRoots.push(root);
  const directory = path.join(root, "plugins", "example");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "styles.css"), styles);
  const asset = { pluginId: "example", directory: "example" } as PluginAsset;
  return verifyPluginStyles(root, path.join(root, "plugins"), [asset], warnings);
}

it("blocks Host-global selectors in every comma branch and nested media rule", async () => {
  const issues = await inspect(`
    .example button, button { color: red; }
    @media (width > 400px) { body .example, :root { color: blue; } }
    .example { & input, input { color: green; } }
    * { box-sizing: border-box; }
  `);
  expect(issues.map((issue) => issue.code)).toEqual(Array(5).fill("PLUGIN_STYLE_GLOBAL_SELECTOR_NOT_ALLOWED"));
  expect(issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
    expect.stringContaining('selector "button"'),
    expect.stringContaining('selector "body .example"'),
    expect.stringContaining('selector ":root"'),
    expect.stringContaining('selector "*"'),
    expect.stringContaining('selector "input"'),
  ]));
});

it("accepts Plugin-owned selectors and nested control styling", async () => {
  expect(await inspect(`
    .example, [data-ui-plugin="example"] { color: var(--foreground); }
    .example button, .example > input:focus { border-color: var(--border); }
    .example { & button { color: red; } }
    @keyframes example-in { from { opacity: 0; } to { opacity: 1; } }
  `)).toEqual([]);
});

it("blocks CSS imports that can pull in unscoped rules", async () => {
  const issues = await inspect('@import "reset.css"; .example { color: red; }');
  expect(issues).toHaveLength(1);
  expect(issues[0]?.code).toBe("PLUGIN_STYLE_GLOBAL_SELECTOR_NOT_ALLOWED");
});

function risks(css: string) {
  const result: string[] = [];
  postcss.parse(css).walkRules((rule) => { result.push(...pluginResponsiveRisks(rule, "example")); });
  return result;
}

it("detects narrow-slot hazards without treating them as style isolation failures", async () => {
  expect(risks(`.example { width:100%; padding:12px; box-sizing:content-box; }
    .example-row { min-width:auto; }
    .example-root { width:500px; }`)).toEqual([
    "FULL_WIDTH_PADDING", "MIN_WIDTH_AUTO", "FIXED_ROOT_WIDTH",
  ]);
  const warnings: ProjectIssue[] = [];
  expect(await inspect('.example { width:100%; padding:12px; }', warnings)).toEqual([]);
  expect(warnings).toEqual([expect.objectContaining({
    code: "PLUGIN_RESPONSIVE_FULL_WIDTH_PADDING", pluginId: "example",
    path: "plugins/example/styles.css", line: 1,
  })]);
});

it("accepts bounded roots and does not confuse descendant or keyframe widths with roots", () => {
  expect(risks(`.example { width:100%; padding:12px; box-sizing:border-box; min-width:0; max-width:100%; }
    .example-root { width:500px; max-width:100%; }
    .example .chart { width:500px; }
    .example-empty { width:100%; padding:0; }`)).toEqual([]);
  expect(risks('[data-ui-plugin="example"] { width:500px; }')).toEqual(["FIXED_ROOT_WIDTH"]);
});
