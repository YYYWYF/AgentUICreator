import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { expect, it } from "vitest";
import { sharedStyleScanSources } from "../scripts/shared-style-sources.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

it("ships standalone tool-call layout and transitions in the packaged base CSS", async () => {
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
    String.raw`.h-\(--collapsible-panel-height\)`,
  ]) expect(css.includes(`${selector} {`), selector).toBe(true);
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
