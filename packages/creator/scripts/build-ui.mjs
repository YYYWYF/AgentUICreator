import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "src/ui/components/creator-ui.css");
const cli = path.join(path.dirname(require.resolve("@tailwindcss/cli/package.json")), "dist/index.mjs");
execFileSync(process.execPath, [cli, "-i", "src/ui/components/creator-ui.input.css", "-o", output, "--minify"], { cwd: root, stdio: "inherit" });

const css = postcss.parse(await readFile(output, "utf8"));
// Host CSS is usually unlayered. Flatten our layers so scoped component rules
// retain their specificity rather than losing to ordinary Host button rules.
css.walkAtRules("layer", rule => {
  if (rule.nodes) rule.replaceWith(...rule.nodes);
  else rule.remove();
});
css.walkRules(rule => {
  if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
  if (rule.selector === ":root,:host") rule.selector = ".creator-ui-scope";
  // Tailwind's property fallbacks must not reset variables on Host elements.
  if (rule.selector.replaceAll("::before", ":before").replaceAll("::after", ":after") === "*,:before,:after,::backdrop") {
    rule.selector = ".creator-ui-scope,.creator-ui-scope *,.creator-ui-scope *::before,.creator-ui-scope *::after,.creator-ui-scope *::backdrop";
  }
});
const animations = new Map();
css.walkAtRules(rule => {
  if (/keyframes$/.test(rule.name)) {
    const original = rule.params;
    const isolated = `creator-ui-${original}`;
    animations.set(original, isolated);
    rule.params = isolated;
  }
});
css.walkDecls(declaration => {
  if (!/(animation|animate)/.test(declaration.prop)) return;
  for (const [original, isolated] of animations) {
    declaration.value = declaration.value.replace(new RegExp(`\\b${original}\\b`, "g"), isolated);
  }
});
// Private names also isolate Tailwind's registered properties and keyframes.
const compiled = css.toString().replaceAll("--tw-", "--creator-tw-");
await writeFile(output, compiled);
