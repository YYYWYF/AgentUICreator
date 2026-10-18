import { mkdir, readFile, writeFile, copyFile, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { initializeAgentUIProject } from '../packages/operator/dist/bootstrap/index.js';
import { createAgentUIInitializationHost } from '../packages/operator/dist/runtime/operator-runtime.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnectionHostFixture } from '../apps/creator-workbench/tests/support/agent-connection-host.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(repo, 'docs/verification/creator-round-robin-2026-10-18');
await mkdir(output, {recursive:true});
const sessions: unknown[] = [];
const hosts = [];
for (const [label, mode, example] of [
  ['A', 'platform', 'creator-host-sandbox'],
  ['B', 'assistant', 'creator-assistant-host'],
  ['C', 'embedded', 'creator-embedded-host'],
] as const) {
  const root = path.join(output, 'projects', label + '-' + mode);
  await mkdir(path.join(root,'src'),{recursive:true});
  const fixture = JSON.parse(await readFile(path.join(repo,'packages/operator/tests/fixtures/project/package.json'),'utf8'));
  delete fixture.devDependencies['@za38.03/agent-ui-creator'];
  fixture.dependencies['@assistant-ui/react-lexical']='0.2.18';
  for (const name of Object.keys({...fixture.dependencies,...fixture.devDependencies})) {
    const candidates = name.startsWith('@za38.03/agent-ui-') ? [path.join(repo,'packages',name.slice('@za38.03/agent-ui-'.length))] : ['operator','plugins','creator','runtime'].map(owner=>path.join(repo,'packages',owner,'node_modules',name)).concat(['creator-host-sandbox','creator-assistant-host'].map(owner=>path.join(repo,'examples',owner,'node_modules',name)));
    const target = candidates.find(existsSync);
    if(!target) throw Error('Missing dependency '+name);
    const dest=path.join(root,'node_modules',name); await mkdir(path.dirname(dest),{recursive:true});
    if(!existsSync(dest)) await symlink(target,dest,process.platform==='win32'?'junction':'dir');
  }
  fixture.name='creator-real-test-'+label.toLowerCase();
  fixture.scripts={dev:'node node_modules/vite/bin/vite.js --host 127.0.0.1',build:'node node_modules/vite/bin/vite.js build',typecheck:'node node_modules/typescript/bin/tsc --noEmit','verify:ui':'node verify-ui.mjs',test:'node verify-ui.mjs'};
  await writeFile(path.join(root,'package.json'),JSON.stringify(fixture,null,2));
  await writeFile(path.join(root,'.npmrc'),'verify-deps-before-run=false\n');
  await writeFile(path.join(root,'pnpm-workspace.yaml'),'verifyDepsBeforeRun: false\n');
  await writeFile(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',jsx:'react-jsx',strict:true,skipLibCheck:true,noEmit:true,resolveJsonModule:true,esModuleInterop:true,lib:['ES2022','DOM'],types:['node','vite/client']},include:['src']}));
  await writeFile(path.join(root,'verify-ui.mjs'),'import {runUIProjectVerificationCli} from "@za38.03/agent-ui-operator/dev"; await runUIProjectVerificationCli(process.cwd());');
  await writeFile(path.join(root,'vite.config.ts'),'import {defineConfig} from "vite"; import react from "@vitejs/plugin-react"; import tailwind from "@tailwindcss/vite"; export default defineConfig({plugins:[react(),tailwind()],resolve:{dedupe:["react","react-dom"]}});');
  if(!existsSync(path.join(root,'.agent-ui/project.json'))) await initializeAgentUIProject({projectRoot:root,mode,sourceRoot:'src/agent-ui'},createAgentUIInitializationHost());
  await writeFile(path.join(root,'index.html'),'<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
  const prepare = async (root: string) => {
      const source = path.join(repo, 'examples', example, 'src');
      for (const name of ['AgentMount.tsx', 'ExampleLocaleHost.tsx', 'host.css']) {
        await copyFile(path.join(source, name), path.join(root, 'src', name));
      }
      if (mode === 'platform') {
        await writeFile(path.join(root,'src/AgentMount.tsx'), 'import {Agent} from "./agent-ui"; export function AgentMount(){return <Agent locale="zh-CN"/>;}');
        await writeFile(path.join(root,'src/App.tsx'), 'import {AgentMount} from "./AgentMount"; export function App(){return <AgentMount/>;}');
      } else await copyFile(path.join(source, 'App.tsx'), path.join(root, 'src/App.tsx'));
      await writeFile(path.join(root,'src/main.tsx'), 'import {createRoot} from "react-dom/client"; import {ExampleLocaleHost} from "./ExampleLocaleHost"; import {App} from "./App"; import "./host.css"; createRoot(document.getElementById("root")!).render(<ExampleLocaleHost><App/></ExampleLocaleHost>);');
      const html = await readFile(path.join(root,'index.html'),'utf8');
      await writeFile(path.join(root,'index.html'), html.replace('<div id="root">', `<title>${label} · ${mode} · Creator 实测</title><div id="root">`));
      await writeFile(path.join(root,'TEST-PROJECT.json'), JSON.stringify({label,mode,createdFor:'Creator round-robin real model testing'},null,2));
    };
  await prepare(root);
  const ports = {A:[56305,56306],B:[56315,56316],C:[56437,56439]}[label];
  const host = await createConnectionHostFixture({existingHostRoot:root,liveModel:true,creatorPort:ports[0],hostPort:ports[1]});
  hosts.push(host);
  sessions.push({label,mode,projectRoot:host.hostRoot,creatorUrl:host.creatorOrigin,hostUrl:host.hostOrigin,workspaceId:host.workspaceId});
  await writeFile(path.join(output,'sessions.json'), JSON.stringify({pid:process.pid,sessions},null,2));
  console.log('TEMPLATE_READY', JSON.stringify(sessions.at(-1)));
}
console.log('ALL_READY');
process.on('SIGINT',()=>void Promise.all(hosts.map(host=>host.close())).then(()=>process.exit()));
await new Promise(()=>{});
