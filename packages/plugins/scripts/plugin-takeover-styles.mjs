import path from "node:path";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

/** Ship the installed presentation's CSS with the source closure. Consumers do
 * not need Creator or Tailwind just to build an unchanged source-owned Plugin.
 * Theme variables, the scoped reset and the Portal root keep their npm owner.
 */
export async function pluginTakeoverStyles(root, files) {
  const code = files.filter(file => /\.tsx?$/u.test(file.target)).map(file => file.content).join("\n");
  const candidates = new Scanner({}).scanFiles([{ content: code, extension: "tsx" }]);
  const compiler = await compile('@layer properties, theme, base, components, utilities;\n@reference "./src/styles.css";\n@layer utilities { @tailwind utilities; }', { base: root, onDependency() {} });
  const styles = [{ target: "presentation.css", origin: "src/styles.css", content: compiler.build(candidates) }];
  // Product-authored selectors complement utility classes (Markdown spacing,
  // attachment states, shimmer, etc.). Keep only rules used by this closure.
  for (const origin of ["src/styles.css", "src/theme/compact.css", "src/theme/conversation-shimmer.css", "src/theme/assistant-ui-theme-overrides.css"]) {
    const css = postcss.parse(await readFile(path.join(root, ...origin.split("/")), "utf8"));
    css.walkAtRules(rule => { if (["import", "reference", "source", "theme"].includes(rule.name)) rule.remove(); });
    css.walkComments(comment => comment.remove());
    css.walkRules(rule => {
      if (rule.parent?.type === "atrule" && /keyframes$/u.test(rule.parent.name)) return;
      const classes = [...rule.selector.matchAll(/\.([a-zA-Z_][\w-]*)/gu)].map(match => match[1])
        .filter(name => !["agent-ui-root", "agent-ui-conversation", "dark", "group"].includes(name));
      const slots = [...rule.selector.matchAll(/\[data-slot\s*=\s*["']([^"']+)["']\]/gu)].map(match => match[1]);
      if (![...classes, ...slots].some(name => code.includes(name))) rule.remove();
    });
    const used = css.toString();
    css.walkAtRules(rule => {
      if (/keyframes$/u.test(rule.name) && !used.includes(` ${rule.params};`) && !used.includes(` ${rule.params} `)) rule.remove();
    });
    let changed;
    do { changed = false; css.walkAtRules(rule => { if (rule.nodes?.length === 0) { rule.remove(); changed = true; } }); } while (changed);
    if (css.nodes.length) styles.push({ target: "presentation/styles/" + origin.slice(4).replaceAll("/", "-"), origin, content: css.toString() + "\n" });
  }
  return styles;
}
