import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { compare, satisfies } from "semver";
import { officialPackageNames, type CompatibilityRelease } from "./compatibility-release.js";
import { ownPackageIdentity, readPackageIdentity, type InstalledPackageIdentity } from "./package-identity.js";
import type { CompatibilityReleaseProvider, ReleaseDiscovery } from "./release-provider.js";

export interface PackageCompatibilityIssue { code: "creator" | "operator" | "node" | "react" | "missing" | "downgrade" | "declaration" | "multiple"; name: string; required: string; actual: string | null }
export interface PackageVersionUpdate {
  name: string; scope: "project" | "tools"; currentVersion: string | null; targetVersion: string | null;
  declared?: string; updateAvailable: boolean; historyIncomplete: boolean;
  summary: { id: string; summary: string; kind: "feature" | "fix" | "breaking"; pluginId?: string; versions: string[] }[];
  history: CompatibilityRelease["packages"][number]["changes"];
}
export interface PackageUpdateOverview {
  status: ReleaseDiscovery["status"]; checkedAt: string; fetchedAt?: string; digest?: string;
  issue?: ReleaseDiscovery["issue"]; recommendedReleaseId?: string; latestReleaseId?: string;
  packages: PackageVersionUpdate[];
  blockedReleases: { id: string; issues: PackageCompatibilityIssue[] }[];
  installationSupported: boolean;
  recovery?: {id:string;state:string}|null;
  fingerprint: string;
}
const isTool = (name: string) => name.endsWith("-creator") || name.endsWith("-operator");
/** This service is deliberately read-only. Remote releases never become source-sync TARGET. */
export class PackageUpdateService {
  constructor(private readonly provider: CompatibilityReleaseProvider, private readonly tools: {root?: string; creatorVersion?: string; nodeVersion?: string} = {}) {}
  async inspect(projectRoot: string, refresh = false): Promise<PackageUpdateOverview> {
    const discovery = await this.provider.check(refresh, projectRoot);
    const operator = await ownPackageIdentity("@za38.03/agent-ui-operator");
    const toolRoot = this.tools.root ?? operator.root;
    const manifest = JSON.parse(await readFile(path.join(projectRoot,"package.json"),"utf8"));
    const declarations = {...manifest.peerDependencies,...manifest.optionalDependencies,...manifest.devDependencies,...manifest.dependencies};
    const installed = new Map<string, InstalledPackageIdentity | undefined>();
    const used = new Set(officialPackageNames.filter(name => !isTool(name) && declarations[name] !== undefined));
    const multiple = new Map<string, Set<string>>();
    const readProject = async (name: string, from = projectRoot): Promise<void> => {
      const identity = await readPackageIdentity(from,name);
      if(installed.has(name)) {
        const previous=installed.get(name);
        if(previous?.version !== identity?.version){const versions=multiple.get(name)??new Set<string>();versions.add(previous?.version??"?");versions.add(identity?.version??"?");multiple.set(name,versions);}
        return;
      }
      installed.set(name,identity);
      if(identity) {
        const pkg=JSON.parse(await readFile(path.join(identity.root,"package.json"),"utf8"));
        const dependencies={...pkg.peerDependencies,...pkg.dependencies};
        for(const dependency of Object.keys(dependencies)) if(officialPackageNames.includes(dependency)&&!isTool(dependency)){
          if(pkg.peerDependenciesMeta?.[dependency]?.optional&&!pkg.dependencies?.[dependency])continue;
          used.add(dependency);await readProject(dependency,identity.root);
        }
      }
    };
    for(const name of [...used])await readProject(name);
    installed.set(operator.name, await readPackageIdentity(toolRoot,operator.name) ?? operator);
    const creator=await readPackageIdentity(toolRoot,"@za38.03/agent-ui-creator");
    if(creator)installed.set(creator.name,creator);
    const creatorVersion=creator?.version ?? this.tools.creatorVersion;
    const react=await readPackageIdentity(projectRoot,"react");
    const relevant=[...used,...officialPackageNames.filter(isTool).filter(name=>installed.has(name))];
    const packages = (): PackageVersionUpdate[] => relevant.map(name=>{
      const identity=installed.get(name);
      return {name,scope:isTool(name)?"tools":"project",currentVersion:identity?.version ?? null,targetVersion:null,...(identity?.declared ?? declarations[name] ? {declared:identity?.declared ?? declarations[name]}:{}),updateAvailable:false,historyIncomplete:false,summary:[],history:[]};
    });
    const overview: PackageUpdateOverview={status:discovery.status,checkedAt:discovery.checkedAt,...(discovery.fetchedAt?{fetchedAt:discovery.fetchedAt}:{}),...(discovery.digest?{digest:discovery.digest}:{}),...(discovery.issue?{issue:discovery.issue}:{}),packages:packages(),blockedReleases:[],installationSupported:false,fingerprint:""};
    const releases=[...(discovery.manifest?.releases ?? [])].filter(release=>release.channel==="stable").sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||b.id.localeCompare(a.id));
    if(releases[0])overview.latestReleaseId=releases[0].id;
    const issuesFor=(release:CompatibilityRelease):PackageCompatibilityIssue[]=>{
      const issues:PackageCompatibilityIssue[]=[...multiple].map(([name,versions])=>({code:"multiple",name,required:"",actual:[...versions].join(", ")}));
      const check=(code:PackageCompatibilityIssue["code"],name:string,required:string|undefined,actual:string|undefined)=>{if(required&&(!actual||!satisfies(actual,required)))issues.push({code,name,required,actual:actual??null});};
      check("creator","@za38.03/agent-ui-creator",release.minimumCreatorVersion?`>=${release.minimumCreatorVersion}`:undefined,creatorVersion);
      check("operator",operator.name,release.minimumOperatorVersion?`>=${release.minimumOperatorVersion}`:undefined,installed.get(operator.name)?.version);
      check("node","node",release.node,this.tools.nodeVersion??process.versions.node);
      if(used.size)check("react","react",release.react,react?.version);
      for(const name of relevant){
        const target=release.packages.find(pkg=>pkg.name===name);const current=installed.get(name);
        if(!target||!current){issues.push({code:"missing",name,required:target?.version??"",actual:current?.version??null});continue;}
        if(compare(target.version,current.version)<0)issues.push({code:"downgrade",name,required:target.version,actual:current.version});
        // Non-registry declarations are reported as facts; this stage never rewrites them.
        const declared=current.declared;
        if(declared && /^[~^<>=*\d]/.test(declared))check("declaration",name,declared,current.version);
      }
      return issues;
    };
    let selected:CompatibilityRelease|undefined;
    for(const release of releases){const issues=issuesFor(release);if(issues.length)overview.blockedReleases.push({id:release.id,issues});else if(!selected)selected=release;}
    if(selected){
      overview.recommendedReleaseId=selected.id;
      overview.packages=overview.packages.map(pkg=>{
        const target=selected!.packages.find(entry=>entry.name===pkg.name)!;
        const historicalChanges = releases.filter(release=>Date.parse(release.publishedAt)<=Date.parse(selected!.publishedAt)).flatMap(release=>release.packages.find(entry=>entry.name===pkg.name)?.changes ?? []);
        const unique = new Map(historicalChanges.map(change=>[JSON.stringify([change.version,change.id,change.pluginId,change.kind,change.summary]),change]));
        const history=[...unique.values()].filter(change=>pkg.currentVersion&&compare(change.version,pkg.currentVersion)>0&&compare(change.version,target.version)<=0).sort((a,b)=>compare(b.version,a.version));
        const summary=new Map<string,PackageVersionUpdate["summary"][number]>();
        for(const change of history){
          const key=JSON.stringify([change.id,change.pluginId,change.kind,change.summary]);const entry=summary.get(key);
          if(entry){if(!entry.versions.includes(change.version))entry.versions.push(change.version);}
          else summary.set(key,{id:change.id,summary:change.summary,kind:change.kind,...(change.pluginId?{pluginId:change.pluginId}:{}),versions:[change.version]});
        }
        return {...pkg,targetVersion:target.version,updateAvailable:!!pkg.currentVersion&&compare(target.version,pkg.currentVersion)>0,historyIncomplete:!!pkg.currentVersion&&compare(target.version,pkg.currentVersion)>0&&(!target.historyFrom||compare(target.historyFrom,pkg.currentVersion)>0||history.length===0),history,summary:[...summary.values()]};
      });
    }
    overview.fingerprint=createHash("sha256").update(JSON.stringify([overview.digest,overview.recommendedReleaseId,overview.packages.map(pkg=>[pkg.name,pkg.currentVersion,pkg.targetVersion])])).digest("hex");
    return overview;
  }
}
