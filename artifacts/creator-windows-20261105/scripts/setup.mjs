import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const scripts=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(scripts,'../../..');
const metadata=JSON.parse(await fs.readFile(path.join(repo,'package.json'),'utf8'));
if(metadata.name!=='agent-ui-creator-workspace')throw Error('Run this checkout artifact in the repository');
const modules=path.join(repo,'apps/creator-workbench/node_modules');
await fs.access(path.join(modules,'@playwright/test/package.json'));
const link=path.join(scripts,'node_modules');
try{await fs.symlink(modules,link,process.platform==='win32'?'junction':'dir');}
catch(error){if(error.code!=='EEXIST')throw error;if(await fs.realpath(link)!==await fs.realpath(modules))throw Error('Existing script node_modules does not point to this checkout');}
await fs.mkdir(path.resolve(scripts,'../local-runs'),{recursive:true});
console.log('QA module resolution is ready. Credentials and new run output remain local.');
