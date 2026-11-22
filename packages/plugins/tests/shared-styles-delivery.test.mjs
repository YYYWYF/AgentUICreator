import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { expect, it } from "vitest";
import { sharedStyleScanSources } from "../scripts/shared-style-sources.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

it("ships standalone tool-call layout and read-only skill badges in the packaged base CSS", async () => {
  // Compile the actual consumer entry without importing any Plugin utility CSS.
  const compiler = await compile('@import "./dist/styles-base.css";', {
    base: packageRoot,
    onDependency() {},
  });
  const candidates = new Scanner({ sources: compiler.sources }).scan();
  const css = compiler.build(candidates);
  for (const selector of [
    ".row-start-1",
    ".col-start-1",
    String.raw`.text-\[13\.5px\]`,
    String.raw`.text-\[11px\]`,
    String.raw`.blur-\[2px\]`,
    ".overflow-x-clip",
    ".justify-self-end",
    String.raw`.h-\(--collapsible-panel-height\)`,
    String.raw`.px-\[7px\]`,
  ]) expect(css.includes(`${selector} {`), selector).toBe(true);
});

it("ships shared image utilities also used by composer buttons instead of dropping them from both stylesheets", async () => {
  const compiler = await compile('@import "./dist/styles-base.css";', {
    base: packageRoot,
    onDependency() {},
  });
  const candidates = new Scanner({ sources: compiler.sources }).scan();
  const css = compiler.build(candidates);
  for (const selector of [".size-7", ".size-8", ".p-1", ".cursor-zoom-in"]) {
    expect(css.includes(`${selector} {`), selector).toBe(true);
  }
  // Plugin CSS omits these candidates because the base entry promises them.
  // Adding that promised set must not reveal utilities missing from the base.
  const sharedCandidates = new Scanner({ sources: sharedStyleScanSources(path.join(packageRoot, "dist")) }).scan();
  expect(compiler.build(sharedCandidates)).toBe(css);
});

it("keeps emitted scan patterns portable with a Windows filesystem root", () => {
  const distRoot = path.win32.resolve("C:\\Agent UI\\plugins\\dist");
  const sources = sharedStyleScanSources(distRoot);
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) {
    expect(source.base).toBe(distRoot);
    expect(source.pattern).not.toContain("\\");
    expect(source.pattern).toMatch(/\.js$/u);
    expect(source.pattern).not.toMatch(/\.tsx?$/u);
  }
});
