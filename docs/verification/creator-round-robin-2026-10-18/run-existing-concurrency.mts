import {writeFile} from 'node:fs/promises';
import {createConnectionHostFixture} from '/Users/yifei/Coding/AgentUICreator/apps/creator-workbench/tests/support/agent-connection-host.ts';
const output='/Users/yifei/Coding/AgentUICreator/docs/verification/creator-round-robin-2026-10-18';
const hosts=[]; const sessions=[];
for (const [label,mode,creatorPort,hostPort] of [['A','platform',56305,56306],['B','assistant',56315,56316],['C','embedded',56437,56439]]) {
 const host=await createConnectionHostFixture({existingHostRoot:`${output}/projects/${label}-${mode}`,liveModel:true,creatorPort,hostPort});
 hosts.push(host); sessions.push({label,mode,projectRoot:host.hostRoot,creatorUrl:host.creatorOrigin,hostUrl:host.hostOrigin,workspaceId:host.workspaceId});
 console.log('TEMPLATE_READY', JSON.stringify(sessions.at(-1)));
}
await writeFile(`${output}/sessions.json`,JSON.stringify({pid:process.pid,sessions},null,2));
console.log('ALL_READY');
process.on('SIGINT',()=>void Promise.all(hosts.map(host=>host.close())).then(()=>process.exit()));
await new Promise(()=>{});
