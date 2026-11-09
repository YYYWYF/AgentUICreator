import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Finalize one self-contained module after Vite, Webpack or Rsbuild emits CSS. */
export async function finalizeShadowStyles(directory, scripts = ['agent-ui.js']) {
  const styles = [];
  async function collect(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('AGENT_UI_SHADOW_OUTPUT_SYMLINK');
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile() && entry.name.endsWith('.css')) styles.push(file);
    }
  }
  await collect(directory);
  const css = (await Promise.all(styles.map(file => readFile(file, 'utf8')))).join('\n');
  if (!css.trim()) throw new Error('AGENT_UI_SHADOW_STYLES_MISSING');
  const marker = /(["'`])__AGENT_UI_BUNDLED_PLUGIN_CSS__\1/g;
  const outputs = [];
  for (const name of scripts) {
    // Script names are output-relative logical paths on every operating system.
    if (path.posix.isAbsolute(name) || name.includes(':') || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error('AGENT_UI_SHADOW_SCRIPT_PATH_INVALID');
    }
    const file = path.join(directory, ...name.split('/'));
    const source = await readFile(file, 'utf8');
    marker.lastIndex = 0;
    if (!marker.test(source)) throw new Error('AGENT_UI_SHADOW_STYLES_MARKER_MISSING');
    outputs.push({ file, source: source.replace(marker, () => JSON.stringify(css)) });
  }
  for (const output of outputs) await writeFile(output.file, output.source);
  for (const file of styles) await unlink(file);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , output = 'dist/agent-ui-web-component', ...scripts] = process.argv;
  await finalizeShadowStyles(path.resolve(output), scripts.length ? scripts : undefined);
}
