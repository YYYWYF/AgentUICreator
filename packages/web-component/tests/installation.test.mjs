import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { initializeAgentUIProject } from '../../bootstrap/dist/index.js';
import { createAgentUIInitializationHost, installOfficialAgentUIResource, inspectOfficialAgentUIResourceCatalog } from '../../project-control/dist/runtime/project-control-runtime.mjs';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const root = await mkdtemp(path.join(tmpdir(), 'agent-ui-compatibility-'));
try {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  await mkdir(path.join(root, 'src'));
  await mkdir(path.join(root, 'node_modules'));
  for (const name of await readdir(path.join(packageRoot, 'node_modules'))) {
    if (name.startsWith('@')) {
      await mkdir(path.join(root, 'node_modules', name));
      for (const child of await readdir(path.join(packageRoot, 'node_modules', name))) {
        await symlink(path.join(packageRoot, 'node_modules', name, child), path.join(root, 'node_modules', name, child), 'junction');
      }
    } else await symlink(path.join(packageRoot, 'node_modules', name), path.join(root, 'node_modules', name), 'junction');
  }
  await mkdir(path.join(root, 'node_modules/@agentui'), { recursive: true });
  await symlink(packageRoot, path.join(root, 'node_modules/@agentui/web-component'), 'junction');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'bridge-install-fixture', private: true, type: 'module', dependencies: { ...manifest.dependencies, ...manifest.devDependencies, '@agentui/web-component': '^0.1.0' } }));
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, types: ['vite/client', 'node'] }, include: ['src'] }));
  const host = createAgentUIInitializationHost();
  await initializeAgentUIProject({ projectRoot: root, mode: 'embedded', sourceRoot: 'src/agent-ui' }, { ...host, installControlPlane: async () => [], installDevelopmentDefaults: async () => [] });
  const before = await inspectOfficialAgentUIResourceCatalog(root);
  assert.equal(before.find(item => item.id === 'web-component-bridge').status, 'missing');
  const result = await installOfficialAgentUIResource(root, 'web-component-bridge', { runPackages: async () => { throw new Error('Fixture dependencies should already satisfy the normal installation plan'); } });
  assert.equal(result.changed, true);
  assert.equal((await inspectOfficialAgentUIResourceCatalog(root)).find(item => item.id === 'web-component-bridge').status, 'ready');
  assert.equal((await installOfficialAgentUIResource(root, 'web-component-bridge')).changed, false);
  // The producer's edited React Plugin must enter its own bundle, rather than
  // silently loading the bridge package's default preset.
  const plugin = path.join(root, 'src/agent-ui/plugins/assistant-ui-slash-command-trigger/index.tsx');
  const source = await readFile(plugin, 'utf8');
  await writeFile(plugin, source.replace('return <ConversationComposerCommandTrigger source={source} labels={labels} />;', 'return <div data-compatibility-fixture="local-plugin"><ConversationComposerCommandTrigger source={source} labels={labels} /></div>;'));
  const build = spawnSync(process.execPath, [path.join(packageRoot, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'src/agent-ui/integrations/web-component-bridge/vite.config.ts'], { cwd: root, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const script = await readFile(path.join(root, 'dist/agent-ui-web-component/agent-ui.js'), 'utf8');
  assert(script.includes('local-plugin'), 'Project-owned React Plugin edits must reach the compiled compatibility bundle');
  assert(!script.includes('__AGENT_UI_BUNDLED_PLUGIN_CSS__'));
  assert(!(await readdir(path.join(root, 'dist/agent-ui-web-component'))).some(name => name.endsWith('.css')));
  // A native Host built from the same fresh source generation shares the
  // surface, but must not include the optional Web Component implementation.
  await writeFile(path.join(root, 'vite.native.config.ts'), `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({ plugins: [react(), tailwindcss()], build: { outDir: "dist/native", lib: { entry: "src/agent-ui/index.ts", formats: ["es"], fileName: () => "native.js" }, rolldownOptions: { output: { codeSplitting: false } } } });`);
  const native = spawnSync(process.execPath, [path.join(packageRoot, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.native.config.ts'], { cwd: root, encoding: 'utf8' });
  assert.equal(native.status, 0, native.stdout + native.stderr);
  const nativeScript = await readFile(path.join(root, 'dist/native/native.js'), 'utf8');
  assert(!nativeScript.includes('agent-ui-bridge-mount'));
  assert(!nativeScript.includes('__AGENT_UI_BUNDLED_PLUGIN_CSS__'));
  const typecheck = spawnSync(path.join(packageRoot, 'node_modules/.bin/tsc'), ['--noEmit'], { cwd: root, encoding: 'utf8' });
  assert.equal(typecheck.status, 0, typecheck.stdout + typecheck.stderr);
  console.log('Resource discovery, normal install plan/apply, idempotence, customized project bundle and native React build/typecheck passed.');
} finally { await rm(root, { recursive: true, force: true }); }
