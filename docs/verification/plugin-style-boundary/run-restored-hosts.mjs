// Restore the previously delivered Creator artifacts unchanged, then run their
// original browser regression with current built packages. No model is invoked.
import {cp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
const repo=process.cwd(),require=createRequire(repo+'/apps/creator-workbench/package.json');
const {createServer}=await import(require.resolve('vite'));
const source=process.env.STYLE_DELIVERED_HOSTS||'/Users/yifei/.codex/visualizations/2026/10/09/01a11ec8-65e6-7c82-a29d-c24c3262dc4b/business-closure/raw';
const root='/tmp/plugin-style-final-hosts',evidence=repo+'/docs/verification/plugin-style-boundary';
await mkdir(root,{recursive:true});const records=[];
const run=(cmd,args,env)=>new Promise(resolve=>{const proc=spawn(cmd,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let log='';proc.stdout.on('data',b=>log+=b);proc.stderr.on('data',b=>log+=b);proc.on('close',code=>resolve({code,log}));});
for(const scene of ['A','B','C']){
 const host=path.join(root,scene);await rm(host,{recursive:true,force:true});await cp(path.join(source,scene),host,{recursive:true,filter:p=>!p.includes('/node_modules')&&!p.includes('/dist')});await symlink(path.join(source,scene,'node_modules'),path.join(host,'node_modules'),'dir');
 // The retained raw Hosts were reset after delivery. Recover the exact recorded
 // Creator output (not a newly authored Plugin), including locales/composition.
 await cp(repo+'/docs/verification/creator-host-ui-delivery/business-closure/generated-source-diff/'+scene,host,{recursive:true,filter:p=>!p.endsWith('.diff')&&!p.endsWith('result.json')});
 const hashes={};for(const file of ['index.tsx','styles.css','definition.ts','manifest.json'])hashes[file]=createHash('sha256').update(await readFile(path.join(host,'src/agent-ui/plugins/business-notes',file))).digest('hex');
 const record={scene,source,restoredHost:host,sourceHashes:hashes,checks:{}};records.push(record);
 for(const script of ['verify:ui','typecheck','build']){const result=await run('pnpm',['--dir',host,script]);await writeFile(path.join(evidence,'checks/final',`${scene}-${script.replace(':','-')}.log`),result.log);record.checks[script]=result.code;}
 const server=await createServer({root:host,cacheDir:host+'/.vite',resolve:{dedupe:['react','react-dom']},server:{hmr:false,port:0,strictPort:false,host:'127.0.0.1',fs:{allow:[repo,host,source,'/private/tmp']}}});await server.listen();
 const port=new URL(server.resolvedUrls.local[0]).port;
 const result=await run('node',[repo+'/docs/verification/creator-host-ui-delivery/business-closure/browser-acceptance.cjs'],{CREATOR_ACCEPTANCE_OUTPUT:root,CREATOR_SCENARIO:scene,CREATOR_PORT:port});record.checks.browser=result.code;await writeFile(path.join(evidence,'checks/final',`${scene}-creator-regression.log`),result.log);await server.close();
}
await cp(root+'/visual',evidence+'/visual/creator-regression',{recursive:true});await writeFile(evidence+'/restored-hosts.json',JSON.stringify(records,null,2));

if (records.some(record => Object.values(record.checks).some(code => code !== 0))) process.exitCode = 1;
