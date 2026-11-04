import {spawnPnpmSync} from '../../../scripts/pnpm-process.mjs';
for(const name of ['plugins','runtime','creator','web-component']){
 const result=spawnPnpmSync(['--filter','@za38.03/agent-ui-'+name,'build'],{cwd:process.cwd(),stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
