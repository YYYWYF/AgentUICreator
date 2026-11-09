// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { initializeAgentUIProject } from '../../src/bootstrap/index';
import { createAgentUIInitializationHost } from '../../src/project/bootstrap-host';
import { resourcePaths } from '../../src/project/optional-resource-paths';
import { collectPluginProjectFacts } from '../../src/project/registry-generator';
import { buildCreatorAuthoringTargetCatalog } from '../../src/project/creator-authoring-target-catalog';

const repository = fileURLToPath(new URL('../../../../../',import.meta.url));
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

it.each(['platform','assistant','embedded'] as const)('initializes %s with Agent props and no project config object',async mode=>{
 const root=await mkdtemp(path.join(tmpdir(),'agent-props-bootstrap-'));roots.push(root);
 const example=path.join(repository,'examples/creator-assistant-host');
 const pkg=JSON.parse(await readFile(path.join(example,'package.json'),'utf8'));
 await writeFile(path.join(root,'package.json'),JSON.stringify({name:'agent-props-test',private:true,type:'module',dependencies:pkg.dependencies}));
 await mkdir(path.join(root,'src'));
 await symlink(path.join(example,'node_modules'),path.join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
 await initializeAgentUIProject({projectRoot:root,mode,sourceRoot:'src/agent-ui'},createAgentUIInitializationHost());
 const source=path.join(root,'src/agent-ui');
 expect(JSON.parse(await readFile(path.join(root,'.agent-ui/project.json'),'utf8'))).toEqual({sourceRoot:'src/agent-ui'});
 await expect(lstat(path.join(source,'config.ts'))).rejects.toMatchObject({code:'ENOENT'});
 await expect(lstat(path.join(source,'hooks'))).rejects.toMatchObject({code:'ENOENT'});
 for(const hook of ['useConversations','useConversationActions']) {
  expect(await readFile(path.join(source,'services','hooks',hook+'.ts'),'utf8')).toContain("from '../conversations'");
 }
 for(const service of ['agent-ui-theme','agent-ui-locale']) {
  await expect(lstat(path.join(source,'services',service+'.ts'))).rejects.toMatchObject({code:'ENOENT'});
 }
 const agentEntry = await readFile(path.join(source,'application/Agent.tsx'),'utf8');
 expect(agentEntry).not.toMatch(/suggestions=|welcome=/);
 const projectConfig = await readFile(path.join(source,'application/project-config.tsx'),'utf8');
 expect(projectConfig).toContain("import { locales } from './locales'");
 expect(projectConfig).toContain('getConversationStarterSuggestions: (_locale, messages)');
 expect(projectConfig).toContain('label: messages.architectureLabel');
 expect(projectConfig).not.toMatch(/import\.meta|\?raw/);
 expect(projectConfig).toContain("import appUIModel from '../app-ui.json'");
 expect(projectConfig).toContain('compositionStore: agentCompositionStore');
 expect(await readFile(path.join(source,'composition-revision.generated.json'),'utf8')).toBe('null\n');
 expect(await readFile(path.join(source,'application/composition-store.ts'),'utf8')).not.toMatch(/import\.meta|globalThis/);
 expect(await readFile(path.join(source,'application/locales.ts'),'utf8')).toContain("'zh-CN': {}");
 async function inspect(directory:string):Promise<void> {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
   const file=path.join(directory,entry.name);
   if(entry.isDirectory())await inspect(file);
   else if(/\.(tsx?|json)$/.test(entry.name)) {
    const content=await readFile(file,'utf8');
    expect(content,file).not.toContain('agentUIConfig');
    expect(content,file).not.toMatch(/import\.meta(?:\.glob|\.env|\.hot)|\?raw/);
    expect(content,file).not.toMatch(/from\s+["'](?:\.\.\/)+hooks\//);
    expect(content,file).not.toMatch(/agentUIRuntimeConfig|ModeShell|data-agent-ui-mode|["']?mode["']?\s*[:=]\s*["'](?:assistant|embedded|platform)["']/);
    expect(content,file).not.toMatch(/from\s+["']\.[^"']*\/services\/agent-ui-(?:theme|locale)["']/);
   }
  }
 }
 await inspect(source);
 {
  await writeFile(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{jsx:'react-jsx'}}));
  const output=await build({root,configFile:false,logLevel:'silent',plugins:[tailwindcss()],build:{write:false,lib:{entry:path.join(source,'application/Agent.tsx'),formats:['es']}}});
  const bundles=(Array.isArray(output)?output:[output]).flatMap(result=>'output' in result?result.output:[]);
  expect(bundles.some(file=>file.type==='chunk'&&file.code.includes(`agent-ui-${mode}-shell`))).toBe(true);
  expect(bundles.some(file=>file.type==='asset'&&file.fileName.endsWith('.css')&&String(file.source).includes(`.agent-ui-${mode==='assistant'?'assistant-panel':mode+'-shell'}`))).toBe(true);
  for(const other of ['assistant','embedded','platform'].filter(value=>value!==mode)) {
   expect(bundles.some(file=>file.type==='chunk'&&file.code.includes(`agent-ui-${other}-shell`))).toBe(false);
  }
 }

 const shellName=mode[0]!.toUpperCase()+mode.slice(1)+'Shell';
 expect(await readdir(path.join(source,'application/shell'))).toEqual(expect.arrayContaining([shellName+'.tsx',mode+'-shell.css']));
 expect((await readdir(path.join(source,'application/shell'))).length).toBe(2);
 const binding=await readFile(path.join(source,'application/runtime-config.generated.ts'),'utf8');
 expect(binding).toContain(`export { ${shellName} as ProjectShell } from './shell/${shellName}';`);
 expect(await readFile(path.join(source,'application/project-config.tsx'),'utf8')).toContain('Shell: ProjectShell');
 const shell=await readFile(path.join(source,'application/shell',shellName+'.tsx'),'utf8');
 if(mode==='assistant') expect(shell).toContain('hidden={!open}');
 expect(shell).not.toContain('@za38.03/agent-ui-runtime/ui/runtime/mode-shell');
 const lock=JSON.parse(await readFile(path.join(root,'.agent-ui/source-lock.json'),'utf8'));
 expect(Object.keys(lock.items).filter(id=>id.startsWith('foundation/shell-'))).toEqual(['foundation/shell-'+mode]);
 const context=await resourcePaths(root);
 const projectFacts=await collectPluginProjectFacts(root,context.config,context.paths);
 const catalog=await buildCreatorAuthoringTargetCatalog({projectRoot:root,...context,projectFacts});
 expect(catalog.bindings.find(binding=>binding.targetId==='conversation.welcome')?.ownerPath).toBe('src/agent-ui/application/locales.ts');
 expect(catalog.bindings.find(binding=>binding.targetId==='conversation.starter-suggestions')?.ownerPath).toBe('src/agent-ui/application/locales.ts');
 expect(catalog.bindings.find(binding=>binding.targetId==='conversation.starter-structure')?.ownerPath).toBe('src/agent-ui/application/project-config.tsx');
 expect(catalog.bindings.find(binding=>binding.targetId==='conversation.composer-copy')?.ownerPath).toBe('src/agent-ui/application/locales.ts');
 expect(catalog.candidates.find(target=>target.id==='plugin-source:composer')?.targetNames).toContain('ConversationComposerPlugin');
 if(mode==='assistant') expect(catalog.bindings.find(binding=>binding.targetId==='appearance.assistant-panel-width')?.ownerPath).toBe('src/agent-ui/application/shell/assistant-shell.css');
 else expect(catalog.bindings.some(binding=>binding.targetId==='appearance.assistant-panel-width')).toBe(false);
 expect(catalog.candidates.find(target=>target.id==='conversation.welcome')?.description).toContain('locales.conversation.welcome');
 expect(catalog.bindings.some(binding=>binding.ownerPath?.endsWith('/config.ts'))).toBe(false);
 if(mode==='assistant') expect(catalog.bindings.find(binding=>binding.targetId==='appearance.assistant-shell')?.ownerPath).toBe('src/agent-ui/application/shell/AssistantShell.tsx');
 else expect(catalog.bindings.some(binding=>binding.targetId==='appearance.assistant-shell')).toBe(false);
 const styleTarget=mode==='assistant'?'appearance.shell-styles':`appearance.${mode}-shell-styles`;
 expect(catalog.bindings.find(binding=>binding.targetId===styleTarget)?.ownerPath).toBe(`src/agent-ui/application/shell/${mode}-shell.css`);
});
