/** Prepare a publisher-reviewed packaged history from actual public-package metadata.
 * This writes an explicitly requested output file; it does not publish packages or claim registry availability.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { publicModules, publicPackageName } from "./build-public-packages.mjs";
export async function prepareCompatibilityRelease({ root, id, notesFile, previousFile, output, publishedAt = new Date().toISOString() }) {
  const { parseCompatibilityManifest } = await import(pathToFileURL(path.join(root,"packages/operator/control/dist/runtime/operator-runtime.mjs")).href);
  const metadata=await Promise.all(publicModules.map(async id=>JSON.parse(await readFile(path.join(root,"packages",id,"package.json"),"utf8"))));
  const versions=Object.fromEntries(metadata.map(pkg=>[pkg.name,pkg.version]));
  const notes=JSON.parse(await readFile(notesFile,"utf8"));
  const packages=metadata.map(pkg=>({name:pkg.name,version:pkg.version,
    requires:Object.fromEntries(Object.entries({...pkg.peerDependencies,...pkg.dependencies}).filter(([name])=>versions[name]).map(([name,range])=>[name,String(range).startsWith("workspace:")?versions[name]:range])),
    ...(notes[pkg.name]?.historyFrom?{historyFrom:notes[pkg.name].historyFrom}:{}),changes:notes[pkg.name]?.changes??[],
  }));
  for(const [index,pkg] of metadata.entries())if(pkg.name!==publicPackageName(publicModules[index]))throw new Error("Official package identity mismatch");
  if(Object.keys(notes).some(name=>!versions[name]))throw new Error("Unknown package in release notes");
  const previous=previousFile?parseCompatibilityManifest(JSON.parse(await readFile(previousFile,"utf8"))):{schemaVersion:1,releases:[]};
  const {Range,intersects}=createRequire(path.join(root,"packages/operator/package.json"))("semver");
  const intersection=ranges=>{
    let alternatives=[""];
    for(const range of ranges)alternatives=alternatives.flatMap(left=>new Range(range).set.map(set=>`${left} ${set.map(comparator=>comparator.value).filter(Boolean).join(" ")}`.trim())).filter(candidate=>intersects(candidate||"*",candidate||"*"));
    if(!alternatives.length)throw new Error("Package engine/peer ranges have no compatible intersection");
    return alternatives.join(" || ");
  };
  const node=intersection(metadata.flatMap(pkg=>pkg.engines?.node?[pkg.engines.node]:[]));
  const react=intersection(metadata.flatMap(pkg=>pkg.peerDependencies?.react?[pkg.peerDependencies.react]:[]));
  const release={id,publishedAt,channel:"stable",...(node?{node}:{}),...(react?{react}:{}),packages};
  if(previous.releases.some(item=>item.id===id))throw new Error("Compatibility release ID already exists");
  const manifest=parseCompatibilityManifest({schemaVersion:1,releases:[...previous.releases,release]});
  await writeFile(output,JSON.stringify(manifest,null,2)+"\n");
  return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const {values}=parseArgs({options:{id:{type:"string"},notes:{type:"string"},previous:{type:"string"},output:{type:"string"}}});
  if(!values.id||!values.notes||!values.output)throw new Error("Provide --id, --notes and --output; validate published artifacts before publishing this history with packages.");
  await prepareCompatibilityRelease({root:fileURLToPath(new URL("..",import.meta.url)),id:values.id,notesFile:path.resolve(values.notes),previousFile:values.previous?path.resolve(values.previous):undefined,output:path.resolve(values.output)});
}
