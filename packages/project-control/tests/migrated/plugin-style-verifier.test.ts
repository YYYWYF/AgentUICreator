import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, it } from "vitest";

import { verifyPluginStyles } from "../../src/project/plugin-style-verifier";
import type { PluginAsset } from "../../src/project/types";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function inspect(styles: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-ui-plugin-css-"));
  temporaryRoots.push(root);
  const directory = path.join(root, "plugins", "example");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "styles.css"), styles);
  const asset = { pluginId: "example", directory: "example" } as PluginAsset;
  return verifyPluginStyles(root, path.join(root, "plugins"), [asset]);
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
