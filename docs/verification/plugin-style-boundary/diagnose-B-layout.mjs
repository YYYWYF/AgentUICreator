// Reuse the original Creator regression's exact actions and Chrome channel.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFile, writeFile, cp } from 'node:fs/promises';
const repo = process.cwd();
const require = createRequire(repo + '/apps/creator-workbench/package.json');
const { createServer } = await import(require.resolve('vite'));
const root = '/tmp/plugin-style-final-hosts/B';
const out = process.env.STYLE_ACCEPTANCE_OUTPUT || repo + '/docs/verification/plugin-style-boundary';
const server = await createServer({ root, cacheDir: root + '/.vite', resolve: { dedupe: ['react', 'react-dom'] }, server: { hmr: false, port: 0, host: '127.0.0.1', fs: { allow: [repo, '/private/tmp'] } } });
await server.listen();
try {
  const code = await new Promise(resolve => {
    const child = spawn('node', [repo + '/docs/verification/creator-host-ui-delivery/business-closure/browser-acceptance.cjs'], {
      stdio: 'inherit', env: { ...process.env, CREATOR_ACCEPTANCE_OUTPUT: '/tmp/plugin-style-final-hosts', CREATOR_SCENARIO: 'B', CREATOR_PORT: new URL(server.resolvedUrls.local[0]).port },
    });
    child.on('close', resolve);
  });
  const rows = JSON.parse(await readFile('/tmp/plugin-style-final-hosts/visual/B-results.json', 'utf8'));
  await writeFile(out + '/B-layout-diagnostic.json', JSON.stringify(rows.filter(row => row.status === 'FAIL').map(({width, theme, locale, error, pluginRect, failureLayout}) => ({width, theme, locale, error, pluginRect, failureLayout})), null, 2));
  await cp('/tmp/plugin-style-final-hosts/visual', out + '/visual/creator-regression', { recursive: true });
  process.exitCode = code;
} finally {
  await server.close();
}
