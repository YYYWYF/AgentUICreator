/** Offline asset renderer. Run from a repository checkout, never from an Agent App. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { robotPose } from './animation.mjs';
const root=path.resolve(fileURLToPath(new URL('.',import.meta.url)));
const options=new Map();for(let i=2;i<process.argv.length;i+=2)options.set(process.argv[i],process.argv[i+1]);
if(!options.get('--three-root'))throw new Error('Provide --three-root pointing to an extracted Three.js 0.186.1 npm package');
const vendor=path.resolve(options.get('--three-root'));
const output=path.resolve(options.get('--output')??path.join(root,'renders'));
const interactive=options.get('--interactive')==='true';
const require=createRequire(new URL('../../apps/creator-workbench/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
await fs.mkdir(output,{recursive:true});
const server=http.createServer(async(req,res)=>{
 try{
  const logical=new URL(req.url,'http://localhost').pathname;
  const base=logical.startsWith('/vendor/')?vendor:root;
  const relative=logical.startsWith('/vendor/')?logical.slice(8):(logical==='/'?'render.html':logical.slice(1));
  const target=path.resolve(base,relative);
  if(!target.startsWith(base+path.sep))throw new Error('path');
  const data=await fs.readFile(target);
  res.setHeader('Content-Type',target.endsWith('.html')?'text/html':/\.m?js$/.test(target)?'text/javascript':target.endsWith('.jpg')?'image/jpeg':'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>window.ready);
 const model=await page.evaluate(()=>window.exportModel());
 await fs.writeFile(path.join(root,'assistant-robot.glb'),Buffer.from(model,'base64'));
 if(interactive){
  const poses=[];
  for(let angle=0;angle<57;angle++)poses.push({yaw:-.7+angle*.025,blink:1,pitch:0,noFace:true});
  for(let pitch=0;pitch<13;pitch++)poses.push({yaw:0,blink:1,pitch:-.18+pitch*.03,noFace:true});
  const faces=[];
  for(const [i,pose] of poses.entries()){
   const url=await page.evaluate(p=>window.renderPose(p.yaw,p.blink,320,p),pose);
   await fs.writeFile(path.join(output,String(i).padStart(4,'0')+'.png'),Buffer.from(url.split(',')[1],'base64'));
   faces.push(await page.evaluate(p=>window.faceGeometry(p.yaw,p.pitch),pose));
   if(i%50===0)console.log(`Rendered interactive pose ${i}/${poses.length}`);
  }
  await fs.writeFile(path.join(output,'poses.json'),JSON.stringify(poses));
  await fs.writeFile(path.join(output,'faces.json'),JSON.stringify(faces));
  const poster=await page.evaluate(()=>window.renderPose(0,1,320));
  await fs.writeFile(path.join(output,'poster.png'),Buffer.from(poster.split(',')[1],'base64'));
 }else{
 const cache=new Map();
 for(let i=0;i<800;i++){
  const state=robotPose(i/25),key=state.yaw.toFixed(7)+','+state.blink.toFixed(7);
  let data=cache.get(key);
  if(!data){const url=await page.evaluate(({yaw,blink})=>window.renderPose(yaw,blink,320),state);data=Buffer.from(url.split(',')[1],'base64');cache.set(key,data)}
  await fs.writeFile(path.join(output,String(i).padStart(4,'0')+'.png'),data);
  if(i%50===0)console.log(`Rendered ${i}/800 frames`);
 }
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
