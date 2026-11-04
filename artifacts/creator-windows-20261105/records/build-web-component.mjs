import {spawnPnpmSync} from '../../../scripts/pnpm-process.mjs';
import {preparationState} from '../../../scripts/preparation-state.mjs';
process.env.AGENT_UI_HOST_PACKAGES_PREPARED=preparationState(['core','renderer','plugins','runtime','creator']);
const result=spawnPnpmSync(['--filter','@za38.03/agent-ui-web-component','build'],{cwd:process.cwd(),stdio:'inherit',env:process.env});
if(result.error)throw result.error;
process.exitCode=result.status??1;
