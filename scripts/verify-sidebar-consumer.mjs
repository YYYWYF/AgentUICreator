import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeAgentUIProject } from '../packages/bootstrap/dist/index.js';
import { createAgentUIInitializationHost } from '../packages/project-control/dist/runtime/project-control-runtime.mjs';

// Run after package builds. Keep the disposable consumers and logs for diagnosis.
const repository = fileURLToPath(new URL('../', import.meta.url));
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidebar-package-consumer-')));
const evidence = path.resolve(process.argv[2] ?? 'docs/sidebar/verification-2026-10-08');
await mkdir(evidence, { recursive: true });
const archives = path.join(root, 'archives');
await mkdir(archives);
const results = { root, archives, packages: {}, hosts: [] };
await writeFile(path.join(evidence, 'consumer.json'), JSON.stringify(results, null, 2));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, NODE_PATH: '', CI: 'true' } });
  return { status: result.status === 0 ? 'passed' : 'failed', exitCode: result.status,
    output: (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? '') };
}
const store = run('pnpm', ['store', 'path'], repository);
assert.equal(store.status, 'passed');
const storeRoot = path.dirname(store.output.trim());
const dependencies = {};
for (const name of ['runtime-core', 'react', 'runtime-conversation', 'runtime-react', 'plugins']) {
  const archive = path.join(archives, `${name}.tgz`);
  const result = run('pnpm', ['pack', '--out', archive], path.join(repository, 'packages', name));
  await writeFile(path.join(evidence, `pack-${name}.log`), result.output);
  assert.equal(result.status, 'passed', `Pack ${name}`);
  dependencies[`@agent-ui/${name}`] = `file:${archive}`;
  const manifest = JSON.parse(await readFile(path.join(repository, 'packages', name, 'package.json'), 'utf8'));
  results.packages[manifest.name] = { version: manifest.version, archive };
}
const template = JSON.parse(await readFile(path.join(repository, 'examples/creator-host-sandbox/package.json'), 'utf8'));
for (const mode of ['platform', 'assistant']) {
  const hostRoot = path.join(root, mode); await mkdir(path.join(hostRoot, 'src'), { recursive: true });
  const production = Object.fromEntries(Object.entries(template.dependencies).filter(([name]) => !name.startsWith('@agent-ui/')));
  const devDependencies = Object.fromEntries(Object.entries(template.devDependencies).filter(([name]) => !name.startsWith('@agent-ui/')));
  await writeFile(path.join(hostRoot, 'package.json'), JSON.stringify({ name: `sidebar-${mode}-consumer`, private: true, type: 'module', dependencies: { ...production, ...dependencies }, devDependencies }, null, 2));
  await writeFile(path.join(hostRoot, 'pnpm-workspace.yaml'), `packages: []\noverrides:\n${Object.entries(dependencies).map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`).join('\n')}\n`);
  const install = run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile', '--prefer-offline', '--store-dir', storeRoot, '--fetch-retries=0', '--fetch-timeout=15000', '--config.enableGlobalVirtualStore=false', '--config.packageImportMethod=copy', '--config.nodeLinker=isolated'], hostRoot);
  await writeFile(path.join(evidence, `consumer-${mode}-install.log`), install.output);
  const entry = { mode, root: hostRoot, install: install.status }; results.hosts.push(entry);
  if (install.status === 'passed') {
    for (const name of Object.keys(dependencies)) assert.ok((await realpath(path.join(hostRoot, 'node_modules', name))).startsWith(hostRoot + path.sep));
    try {
      await initializeAgentUIProject({ projectRoot: hostRoot, mode, sourceRoot: 'src/agent-ui' }, createAgentUIInitializationHost());
      entry.generation = 'passed';
      await writeFile(path.join(hostRoot, 'src/main.tsx'), `import { createRoot } from 'react-dom/client';\nimport { Agent } from './agent-ui';\nimport { AgentUISidebarFrame } from '@agent-ui/react';\nimport type { SidebarNode } from '@agent-ui/runtime-react';\nimport '@agent-ui/react/styles.css';\nconst node: SidebarNode = {type:'sidebar',id:'probe',defaultActive:null,items:[],content:{type:'slot',id:'main',slotId:'main'}};\nvoid [node,AgentUISidebarFrame];\ncreateRoot(document.getElementById('root')!).render(<Agent/>);\n`);
      await writeFile(path.join(hostRoot, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
      await writeFile(path.join(hostRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: false, noEmit: true, lib: ['DOM', 'ES2022'], types: ['vite/client'] }, include: ['src'] }));
      await writeFile(path.join(hostRoot, 'vite.config.mjs'), `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import tailwind from '@tailwindcss/vite'; export default defineConfig({plugins:[react(),tailwind()]});`);
      for (const [name, args] of [['typecheck', ['exec','tsc','--noEmit']], ['build', ['exec','vite','build']]]) {
        const check = run('pnpm', args, hostRoot); entry[name] = check.status;
        await writeFile(path.join(evidence, `consumer-${mode}-${name}.log`), check.output);
      }
    } catch (error) { entry.generation = 'failed'; entry.error = String(error); }
  }
  await writeFile(path.join(evidence, 'consumer.json'), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
if (results.hosts.some(host => host.install !== 'passed' || host.generation !== 'passed' || host.typecheck !== 'passed' || host.build !== 'passed')) process.exitCode = 1;
