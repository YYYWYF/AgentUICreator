import { readFile, realpath, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { satisfies, valid, validRange, intersects } from "semver";
import { createDefaultAgentUIPresetRegistry, agentUIModeRegistry, initializeAgentUIProject, validateAgentUIProjectSetup, type InitializeAgentUIProjectInput } from "../bootstrap/index.js";
import { loadAgentUISourceRegistry } from "../source-catalog/index.js";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import { resolveAgentUISourceItems } from "./source-registry/installer";
import { withPackageDependency } from "./source-registry/package-dependencies";
import { createAgentUIInitializationHost } from "./bootstrap-host";
import { detectResourcePackageManager } from "./ensure-resource-packages";
import { ownPackageIdentity, readPackageIdentity } from "../updates/package-identity";
import { acquireOperatorLock } from "./operator-lock";
import { assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";

const JOURNAL = ".agent-ui/creator/dependency-install.json";
const LOCKS = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "npm-shrinkwrap.json"];
const FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;
const issuedPlans = new Map<string, number>();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fail(code: string, details?: unknown): never { throw Object.assign(new Error(code), { code, details }); }
async function optional(file: string) {
  try { return await readFile(file, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
async function atomicWrite(file: string, text: string) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, text, { flag: "wx" }); await rename(temporary, file); }
  finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}

export interface ReactInitializationDependencyPlan {
  readonly id: string;
  readonly projectRoot: string;
  readonly packageJsonPath: string;
  readonly manager: "npm" | "pnpm";
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
  readonly installCommand: string;
  readonly packages: readonly { name: string; required: readonly string[]; version: string; action: "install" | "reuse" }[];
  readonly installRequired: boolean;
}

/** Planning is read-only. Template/catalog requirements, not model guesses, select packages. */
export async function planReactAgentUIProject(input: InitializeAgentUIProjectInput) {
  const projectRoot = await realpath(input.projectRoot);
  const validation = await validateAgentUIProjectSetup({ ...input, projectRoot });
  if (!validation.valid) return { ...validation, dependencyPlan: undefined };
  for (let directory = projectRoot; ; directory = path.dirname(directory)) {
    const text = await optional(path.join(directory, "package.json"));
    if (await optional(path.join(directory, "pnpm-workspace.yaml")) !== undefined || (text && "workspaces" in JSON.parse(text))) fail("AGENT_UI_SETUP_WORKSPACE_UNSUPPORTED");
    if (directory === path.dirname(directory)) break;
  }
  for (const name of ["package.json", ".npmrc", ...LOCKS, JOURNAL]) await assertNoSymbolicLinkTraversal(projectRoot, name);
  const pending = await optional(path.join(projectRoot, JOURNAL));
  if (pending && JSON.parse(pending).stage === "installing") fail("AGENT_UI_SETUP_INSTALL_REVIEW_REQUIRED");
  const manager = await detectResourcePackageManager(projectRoot);
  if (manager !== "npm" && manager !== "pnpm") fail("AGENT_UI_SETUP_MANAGER_UNSUPPORTED");
  const locks = Object.fromEntries(await Promise.all(LOCKS.map(async name => [name, await optional(path.join(projectRoot, name))])));
  if (Object.entries(locks).some(([name, text]) => text !== undefined && name !== (manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml"))) fail("AGENT_UI_SETUP_MANAGER_UNSUPPORTED");
  const original = await readFile(path.join(projectRoot, "package.json"), "utf8");
  const manifest = JSON.parse(original);
  const registry = await loadAgentUISourceRegistry();
  const preset = createDefaultAgentUIPresetRegistry(parseAppUIModel).getDefaultForMode(input.mode, agentUIModeRegistry);
  const items = resolveAgentUISourceItems(registry, preset.sourceItems ?? []).map(withPackageDependency);
  const required = new Map<string, Set<string>>();
  for (const item of items) for (const [name, range] of Object.entries(item.packages ?? {})) {
    required.set(name, new Set([...(required.get(name) ?? []), range]));
  }
  // A React host keeps its own renderer version. React DOM follows React when absent.
  required.set("react-dom", new Set(required.get("react") ?? [">=18 <20"]));
  const creator = await ownPackageIdentity("@za38.03/agent-ui-creator");
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const packages: ReactInitializationDependencyPlan["packages"][number][] = [];
  const identities: unknown[] = [];
  let installRequired = false;
  let reactVersion: string | undefined;
  for (const [name, ranges] of required) {
    const installed = await readPackageIdentity(projectRoot, name);
    // Only project-root resolution satisfies a direct generated-source import.
    const direct = await optional(path.join(projectRoot, "node_modules", ...name.split("/"), "package.json"));
    const current = direct ? installed : undefined;
    const declarations = FIELDS.flatMap(field => manifest[field]?.[name] === undefined ? [] : [manifest[field][name] as string]);
    const fits = (version: string) => [...ranges].every(range => satisfies(version, range));
    if (declarations.length > 1 || declarations.some(value => validRange(value) && [...ranges].some(range => !intersects(value, range))) || (current && !fits(current.version))) {
      fail("AGENT_UI_SETUP_DEPENDENCY_CONFLICT", [{ code: "AGENT_UI_SETUP_PACKAGE_VERSION", message: `${name}: ${declarations.join(", ") || current?.version} → ${[...ranges].join(", ")}` }]);
    }
    let version = current?.version;
    if (!version) {
      if (declarations.some(value => !validRange(value))) fail("AGENT_UI_SETUP_DEPENDENCY_CONFLICT");
      const exact = [...ranges].find(range => valid(range));
      const baseline = await readPackageIdentity(creator.root, name);
      version = name === "react-dom" && reactVersion ? reactVersion : exact ?? baseline?.version;
      if (!version || !fits(version) || declarations.some(value => !satisfies(version!, value))) fail("AGENT_UI_SETUP_DEPENDENCY_CONFLICT");
    }
    if (name === "react") reactVersion = version;
    if (name === "react-dom" && reactVersion !== version) fail("AGENT_UI_SETUP_DEPENDENCY_CONFLICT");
    if (!declarations.length) (name === "tailwindcss" ? devDependencies : dependencies)[name] = version;
    const action = !current || !declarations.length ? "install" : "reuse";
    if (action === "install") installRequired = true;
    packages.push({ name, required: [...ranges], version, action });
    identities.push([name, current?.root, direct]);
  }
  const plan = { projectRoot, packageJsonPath: path.join(projectRoot, "package.json"), manager, dependencies, devDependencies, installCommand: `${manager} install`, packages, installRequired };
  // Bind consent to the exact project, lockfiles, registry config, source templates and resolved identities.
  const context = { original, locks, npmrc: await optional(path.join(projectRoot, ".npmrc")), pending,
    sourceRoot: validation.sourceRoot, mode: input.mode, creator,
    templates: items.map(item => [item.id, item.packages, item.loadedFiles]), identities };
  const id = hash(JSON.stringify({ plan, context }));
  const now = Date.now();
  for (const [key, expires] of issuedPlans) if (expires < now) issuedPlans.delete(key);
  if (!issuedPlans.has(id)) issuedPlans.set(id, now + 15 * 60_000);
  return { ...validation, dependencyPlan: { ...plan, id } satisfies ReactInitializationDependencyPlan };
}

/** Confirmation prepares declarations only. The user installs dependencies with their own package manager. */
export async function initializeReactAgentUIProject(input: InitializeAgentUIProjectInput & { planId?: string }) {
  if (!input.planId || (issuedPlans.get(input.planId) ?? 0) < Date.now()) fail("AGENT_UI_SETUP_PLAN_STALE");
  let validation = await planReactAgentUIProject(input);
  const plan = validation.dependencyPlan;
  if (!plan || plan.id !== input.planId) fail("AGENT_UI_SETUP_PLAN_STALE");
  const release = await acquireOperatorLock(plan.projectRoot);
  try {
    validation = await planReactAgentUIProject(input);
    if (validation.dependencyPlan?.id !== plan.id) fail("AGENT_UI_SETUP_PLAN_STALE");
    if (Object.keys(plan.dependencies).length || Object.keys(plan.devDependencies).length) {
      const original = await readFile(path.join(plan.projectRoot, "package.json"), "utf8");
      const manifest = JSON.parse(original);
      const next = { ...manifest };
      if (Object.keys(plan.dependencies).length) next.dependencies = { ...manifest.dependencies, ...plan.dependencies };
      if (Object.keys(plan.devDependencies).length) next.devDependencies = { ...manifest.devDependencies, ...plan.devDependencies };
      // Only the manifest changes; locks, node_modules, host config and Agent UI source stay untouched.
      try { await atomicWrite(path.join(plan.projectRoot, "package.json"), `${JSON.stringify(next, null, 2)}\n`); }
      catch { fail("AGENT_UI_SETUP_DEPENDENCY_PREPARATION_FAILED"); }
      issuedPlans.delete(plan.id);
      return { status: "dependencies-prepared" as const, projectRoot: plan.projectRoot, installCommand: plan.installCommand };
    }
    if (plan.installRequired) fail("AGENT_UI_SETUP_INSTALL_REQUIRED");
    issuedPlans.delete(plan.id);
    return await initializeAgentUIProject({ ...input, projectRoot: plan.projectRoot }, createAgentUIInitializationHost());
  } finally { await release(); }
}
