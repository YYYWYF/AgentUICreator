// Isolated test consumer: real initialization/catalog, no Creator runtime dependency.
import {mkdir, readFile, writeFile, symlink, realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [root, repository, mode = 'platform'] = process.argv.slice(2);
if (!path.isAbsolute(root) || !path.isAbsolute(repository)) throw new Error('Absolute fixture roots required');
await mkdir(root, {recursive:true});
const fixture = JSON.parse(await readFile(path.join(repository, 'packages/creator/operator/tests/fixtures/project/package.json'), 'utf8'));
const workspace = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'));
const devNames = ['typescript','vite','@vitejs/plugin-react','@tailwindcss/vite','tailwindcss','tw-animate-css','@types/node','@types/react','@types/react-dom','@za38.03/agent-ui-creator'];
const dependencies = {...fixture.dependencies, '@za38.03/agent-ui-plugins':'workspace:*', '@assistant-ui/react-lexical':JSON.parse(await readFile(path.join(repository,'packages/plugins/node_modules/@assistant-ui/react-lexical/package.json'),'utf8')).version};
const devDependencies = Object.fromEntries(devNames.map(name => [name, fixture.devDependencies[name] ?? fixture.dependencies[name]]));
for (const name of Object.keys({...dependencies,...devDependencies})) {
  const candidates = [
    ...(name.startsWith('@za38.03/agent-ui-') ? [path.join(repository,'packages',name.slice('@za38.03/agent-ui-'.length))] : []),
    ...['creator','plugins','runtime','react','core','renderer'].map(owner=>path.join(repository,'packages',owner,'node_modules',name)),
  ];
  const source = candidates.find(existsSync);
  if (!source) throw new Error(`Missing existing test dependency: ${name}`);
  const target = path.join(root,'node_modules',name);
  await mkdir(path.dirname(target),{recursive:true});
  await symlink(await realpath(source),target,process.platform==='win32'?'junction':'dir');
}
await writeFile(path.join(root,'package.json'),JSON.stringify({name:'creator-phase3-test',private:true,type:'module',packageManager:workspace.packageManager,dependencies,devDependencies,scripts:{'verify:ui':'node verify-ui.mjs',typecheck:'node node_modules/typescript/bin/tsc --noEmit',build:'node build.mjs',dev:'node node_modules/vite/bin/vite.js --host 127.0.0.1'}},null,2));
await writeFile(path.join(root,'.npmrc'),'verify-deps-before-run=false\n');
await writeFile(path.join(root,'pnpm-workspace.yaml'),'verifyDepsBeforeRun: false\n');
await mkdir(path.join(root,'src'),{recursive:true});
await writeFile(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',jsx:'react-jsx',strict:true,skipLibCheck:true,noEmit:true,resolveJsonModule:true,esModuleInterop:true,lib:['ES2022','DOM'],types:['node','vite/client']},include:['src']}));
await writeFile(path.join(root,'verify-ui.mjs'),'import {runUIProjectVerificationCli} from "@za38.03/agent-ui-creator/operator/dev"; await runUIProjectVerificationCli(process.cwd());');
await writeFile(path.join(root,'build.mjs'),'import {build} from "vite"; import react from "@vitejs/plugin-react"; import tailwind from "@tailwindcss/vite"; await build({configFile:false,plugins:[react(),tailwind()],logLevel:"error",resolve:{dedupe:["react","react-dom"]},build:{write:false,lib:{entry:"src/agent-ui/application/Agent.tsx",formats:["es"]}}});');
const {initializeAgentUIProject} = await import(pathToFileURL(path.join(repository,'packages/creator/operator/dist/bootstrap/index.js')).href);
const {createAgentUIInitializationHost} = await import(pathToFileURL(path.join(repository,'packages/creator/operator/dist/runtime/operator-runtime.mjs')).href);
await initializeAgentUIProject({projectRoot:root,mode,sourceRoot:'src/agent-ui'},createAgentUIInitializationHost());
console.log(JSON.stringify({projectRoot:root,mode,initialized:true}));
