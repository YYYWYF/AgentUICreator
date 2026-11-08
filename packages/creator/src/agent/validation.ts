import { signalProcessTree } from "../processTree.js";
import { spawn } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { requestOperator } from "./operator.js";
import type { RunActivity } from "./activity.js";
import { staticTargetId, type DebuggingEvidence } from "./debugging.js";
import { sourceRoot } from "./activity.js";
import { readCreatorFileState } from "./files/creatorFileState.js";
import { projectCheckIdentity } from "./inspection.js";
import { inspectLocalizedDefaults } from "./localized-defaults.js";

interface Check { command: string; status: "passed" | "failed"; exitCode: number | null; output: string; truncated: boolean; revision: number }
function normalizeDiagnostic(line: string) { return line.replaceAll("\\", "/").replace(/\(\d+,\d+\)(?=: error TS\d+:)/u, "").trim(); }
function diagnostics(output: string) { return new Set(output.split(/\r?\n/u).filter(line => /error TS\d+:/u.test(line)).map(normalizeDiagnostic)); }

export class CreatorValidation {
  private baseline: Promise<{ staticErrors: Set<string>; typeErrors: Set<string>; typeCheck: Check }> | undefined;
  private checked: { identity: string; revision: number; mode: string; scope: string; result: any } | undefined;
  private lastResult: any;
  constructor(readonly root: string, readonly activity: RunActivity, readonly signal: () => AbortSignal, readonly debugging?: DebuggingEvidence) {}
  async currentStatus() {
    const revision = this.activity.revision;
    if (!this.lastResult) return { status: "not-run", revision };
    if (this.lastResult.revision !== revision) return { status: "stale", revision };
    if (this.checked && (this.checked.scope !== JSON.stringify([...(this.debugging?.selected ?? [])].sort()) || this.checked.identity !== await projectCheckIdentity(this.root, this.signal()))) {
      this.checked = undefined;
      this.lastResult = undefined;
      this.activity.validationRevision = null;
      return { status: "stale", revision };
    }
    return { status: this.lastResult.status, revision, reusable: Boolean(this.checked),
      checks: this.lastResult.checks.map((check: Check) => ({ command: check.command, status: check.status })) };
  }
  ensureBaseline() {
    return this.baseline ??= (async () => {
      const staticResult = await requestOperator(this.root, "verify_ui_project", {}, this.signal());
      const typeCheck = await this.script("typecheck");
      return { staticErrors: new Set([...(staticResult.errors ?? []), ...(staticResult.sourceDiagnostics ?? [])].map((issue: any) => JSON.stringify(issue))), typeErrors: diagnostics(typeCheck.output), typeCheck };
    })();
  }
  async validate({ includeBuild = false, mode = "delta", force = false }: { includeBuild?: boolean; mode?: "delta" | "clean"; force?: boolean }) {
    const identity = await projectCheckIdentity(this.root, this.signal());
    const scope = JSON.stringify([...(this.debugging?.selected ?? [])].sort());
    if (identity !== undefined && !force && !includeBuild && this.checked?.identity === identity && this.checked.revision === this.activity.revision && this.checked.mode === mode && this.checked.scope === scope) {
      this.signal().throwIfAborted();
      await this.activity.log("validation_reused", { revision: this.activity.revision, mode });
      return { ...structuredClone(this.checked.result), reused: true };
    }
    const baseline = await this.ensureBaseline();
    for (const [file, before] of this.activity.before) {
      if (!/\/plugins\/[^/]+\/(?:manifest\.json|definition\.ts|application\.json)$/u.test(file)) continue;
      if ((await readCreatorFileState(this.root, file)).hash === before.hash) continue;
      const registry = `${await sourceRoot(this.root)}/plugins/registry.generated.ts`;
      const current = await readCreatorFileState(this.root, registry);
      await this.activity.capture(registry);
      await requestOperator(this.root, "synchronize_plugin_registry", { expectedSourceHash: current.hash }, this.signal());
      const after = await readCreatorFileState(this.root, registry);
      if (after.hash !== current.hash) { this.activity.recordAfter(registry, after); this.activity.revision++; }
      break;
    }
    const staticResult = await requestOperator(this.root, "verify_ui_project", {}, this.signal());
    const pluginPrefix = `${await sourceRoot(this.root)}/plugins/`;
    const affectedPlugins = new Set<string>();
    for (const [file, before] of this.activity.before) {
      if (!file.startsWith(pluginPrefix)) continue;
      const relative = file.slice(pluginPrefix.length);
      if (!relative.includes("/") || (await readCreatorFileState(this.root, file)).hash === before.hash) continue;
      affectedPlugins.add(relative.split("/")[0]!);
    }
    const currentStaticIssues: any[] = [...new Map([...(staticResult.errors ?? []), ...(staticResult.sourceDiagnostics ?? []).filter((issue: any) => affectedPlugins.has(issue.pluginId))]
      .map((issue: any) => [JSON.stringify(issue), issue])).values()];
    const typeCheck = await this.script("typecheck");
    const currentTypes = diagnostics(typeCheck.output);
    const introducedTypes = [...currentTypes].filter(value => !baseline.typeErrors.has(value));
    const staticErrors = currentStaticIssues.filter((issue: any) => !baseline.staticErrors.has(JSON.stringify(issue)));
    const unknownTypeFailure = typeCheck.status === "failed" && currentTypes.size === 0;
    const checks: Check[] = [typeCheck];
    const copyChanges = [];
    for (const [file, before] of this.activity.before) {
      if (!/\.[jt]sx$/iu.test(file)) continue;
      copyChanges.push({ path: file, before: before.content ?? "", after: (await readCreatorFileState(this.root, file)).content ?? "" });
    }
    const localizedDefaults = await inspectLocalizedDefaults(this.root, copyChanges);
    if (copyChanges.length) checks.push({ command: "verify_localized_defaults_delta", status: localizedDefaults.length ? "failed" : "passed",
      exitCode: localizedDefaults.length ? 1 : 0, output: JSON.stringify({ coverage: "package-declared locale-backed default props", issues: localizedDefaults }), truncated: false, revision: this.activity.revision });
    if (includeBuild) checks.push(await this.script("build"));
    const targetRemaining = this.debugging?.staticRemaining(new Set([...currentTypes].map(staticTargetId))) ?? [];
    const passed = !localizedDefaults.length && !targetRemaining.length && (mode === "clean"
      ? staticResult.status === "passed" && !currentStaticIssues.length && checks.every(check => check.status === "passed")
      : !staticErrors.length && !introducedTypes.length && !unknownTypeFailure && (!includeBuild || checks.at(-1)?.status === "passed"));
    const result = { status: passed ? "passed" : "failed", revision: this.activity.revision, mode, checks,
      targetRemaining, registryFresh: staticResult.registryFresh, pluginStates: (staticResult.pluginStates ?? []).filter((state: any) => affectedPlugins.has(state.pluginId)),
      introduced: { staticErrors, typeErrors: introducedTypes, localizedDefaults }, workspaceWarnings: { staticErrors: currentStaticIssues.filter((issue: any) => baseline.staticErrors.has(JSON.stringify(issue))), typeErrors: [...currentTypes].filter(value => baseline.typeErrors.has(value)) } };
    // Keep raw command outcomes honest even when unchanged workspace failures
    // do not block a delta. The separate summary records the delta decision.
    this.activity.validations = [
      ...checks,
      { command: "verify_creator_delta", status: passed ? "passed" : "failed", exitCode: passed ? 0 : 1, output: JSON.stringify(result), truncated: false, revision: this.activity.revision },
    ];
    this.lastResult = structuredClone(result);
    this.activity.validationRevision = passed ? this.activity.revision : null;
    if (passed && identity !== undefined && identity === await projectCheckIdentity(this.root, this.signal())) {
      this.checked = { identity, revision: this.activity.revision, mode, scope, result: structuredClone(result) };
    } else this.checked = undefined;
    return result;
  }
  async inspectStatic() {
    const structural = await requestOperator(this.root, "verify_ui_project", {}, this.signal());
    const check = await this.script("typecheck");
    return { revision: this.activity.revision, structural, check, diagnostics: [...diagnostics(check.output)].map(message => ({ targetId: staticTargetId(message), debuggingTargetId: staticTargetId(message), message, file: message.split(": error TS")[0], revision: this.activity.revision })) };
  }
  async behavior(pluginId: string, interactions: string[]) {
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/u.test(pluginId)) throw new Error("PLUGIN_ID_INVALID");
    const manifest = JSON.parse(await readFile(path.join(this.root, "package.json"), "utf8"));
    if (!{ ...manifest.dependencies, ...manifest.devDependencies }["@playwright/test"]) throw new Error("PLUGIN_BEHAVIOR_INFRASTRUCTURE_UNAVAILABLE");
    let config = false;
    for (const extension of ["ts", "js", "mjs", "cjs", "mts", "cts"]) try { await access(path.join(this.root, `playwright.config.${extension}`)); config = true; break; } catch { /* Only the existing project config is allowed. */ }
    if (!config) throw new Error("PLUGIN_BEHAVIOR_INFRASTRUCTURE_UNAVAILABLE");
    const require = createRequire(path.join(this.root, "package.json"));
    const entry = path.join(path.dirname(require.resolve("@playwright/test/package.json")), "cli.js");
    const result = await this.execute(process.execPath, [entry, "test", "--grep", `\\[delivery:${pluginId}\\]`, "--reporter=json"], "playwright delivery");
    const report = JSON.parse(result.output);
    if (!Array.isArray(report.suites)) throw new Error("PLUGIN_BEHAVIOR_REPORT_INVALID");
    const passed = new Set<string>(); let failed = Boolean(report.errors?.length);
    const visit = (suite: any) => {
      for (const spec of suite.specs ?? []) {
        if (spec.tests?.length && spec.tests.every((test: any) => test.status === "expected" && test.results?.length && test.results.every((run: any) => run.status === "passed"))) passed.add(spec.title);
        else failed = true;
      }
      for (const child of suite.suites ?? []) visit(child);
    };
    for (const suite of report.suites) visit(suite);
    const required = (interactions.length ? interactions : ["runtime"]).map(value => `[delivery:${pluginId}] ${value}`);
    const missingTests = required.filter(value => !passed.has(value));
    return { status: result.status === "passed" && !result.truncated && !failed && !missingTests.length ? "passed" : "failed", revision: this.activity.revision, pluginId, requiredTests: required, missingTests, passedTests: [...passed] };
  }
  private async script(script: "typecheck" | "build"): Promise<Check> {
    const manifest = JSON.parse(await readFile(path.join(this.root, "package.json"), "utf8"));
    const failure = (output: string): Check => ({ command: script, status: "failed", exitCode: null, output, truncated: false, revision: this.activity.revision });
    if (!manifest.scripts?.[script]) return failure(`HOST_VALIDATION_SCRIPT_MISSING: ${script}`);
    let manager: string | undefined;
    for (let directory = this.root; ; directory = path.dirname(directory)) {
      try {
        const parent = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
        if (typeof parent.packageManager === "string") manager = parent.packageManager.split("@")[0];
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (!manager) for (const [file, name] of [["pnpm-lock.yaml", "pnpm"], ["package-lock.json", "npm"], ["yarn.lock", "yarn"], ["bun.lock", "bun"]]) {
        try { await access(path.join(directory, file!)); manager = name; break; } catch { /* Detect only existing evidence. */ }
      }
      if (manager || path.dirname(directory) === directory) break;
    }
    if (!manager || !["npm", "pnpm", "yarn", "bun"].includes(manager)) return failure("HOST_PACKAGE_MANAGER_UNRESOLVED");
    let command = manager, argv = ["run", script];
    const entry = process.env.npm_execpath;
    if (entry && (path.basename(entry).startsWith(manager + ".") || path.basename(entry).startsWith(manager + "-"))) { command = process.execPath; argv = [entry, ...argv]; }
    const windowsShell = process.platform === "win32" && command !== process.execPath;
    if (windowsShell) command += ".cmd";
    return this.execute(command, argv, `${manager} run ${script}`, windowsShell);
  }
  private async execute(command: string, argv: string[], label: string, windowsShell = false): Promise<Check> {
    return new Promise(resolve => {
      const child = spawn(command!, argv, { cwd: this.root, shell: windowsShell, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
      let output = "", truncated = false, timeout = false;
      const terminate = () => signalProcessTree(child, true);
      const signal = this.signal(); signal.addEventListener("abort", terminate, { once: true });
      const timer = setTimeout(() => { timeout = true; terminate(); }, 120_000);
      for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
        output += chunk.toString(); if (output.length > 256_000) { output = output.slice(-256_000); truncated = true; }
      });
      child.once("error", error => { output += error.message; });
      child.once("close", code => {
        clearTimeout(timer); signal.removeEventListener("abort", terminate);
        resolve({ command: label, status: code === 0 && !timeout && !signal.aborted ? "passed" : "failed", exitCode: code, output: (timeout ? "HOST_VALIDATION_TIMEOUT\n" : "") + output, truncated, revision: this.activity.revision });
      });
      if (signal.aborted) terminate();
    });
  }
}
