import { afterEach, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileDevelopmentEntry } from "../src/development-source.js";
import { combineAbortSignals } from "../src/agent/abort-signals.js";
import { CREATOR_HOST_ENV_FILE, readCreatorHostEnvironment } from "../src/creatorRuntimeConfig.js";
import { creatorWatchOptions } from "../src/nodeWatch.js";

const roots: string[] = [];
const anyDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, "any");
afterEach(async () => {
  if (anyDescriptor) Object.defineProperty(AbortSignal, "any", anyDescriptor);
  else Reflect.deleteProperty(AbortSignal, "any");
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "creator Node 20 配置 "));
  roots.push(root);
  return root;
}

it("uses compatible early Node 20 macOS watching while preserving explicit Host settings", () => {
  const configured = { ignored: ["**/business-cache/**"], interval: 150 };
  expect(creatorWatchOptions(configured, "darwin", "20.0.0")).toEqual({ ...configured, usePolling: true });
  expect(creatorWatchOptions(undefined, "darwin", "20.11.1")).toEqual({ usePolling: true });
  const explicit = { usePolling: false };
  expect(creatorWatchOptions(explicit, "darwin", "20.0.0")).toBe(explicit);
  expect(creatorWatchOptions(null, "darwin", "20.0.0")).toBeNull();
  for (const [platform, version] of [["win32", "20.0.0"], ["linux", "20.0.0"], ["darwin", "20.12.0"], ["darwin", "22.0.0"], ["darwin", "24.22.1"]] as const) {
    expect(creatorWatchOptions(configured, platform, version)).toBe(configured);
  }
});

it("parses quoted, exported and multiline host configuration without changing process env", async () => {
  const root = await temporaryRoot();
  await mkdir(path.join(root, ".agent-ui/creator"), { recursive: true });
  await writeFile(path.join(root, CREATOR_HOST_ENV_FILE), [
    'export CREATOR_ENV_FIXTURE="quoted # value"', "SINGLE='text # inside'", "EMPTY=",
    "COMMENT=value # comment", 'MULTILINE="line1', 'line2"', 'ESCAPES="line1\\nline2"',
  ].join("\r\n"));
  const before = process.env.CREATOR_ENV_FIXTURE;
  expect(readCreatorHostEnvironment(root)).toEqual({
    CREATOR_ENV_FIXTURE: "quoted # value", SINGLE: "text # inside", EMPTY: "",
    COMMENT: "value", MULTILINE: "line1\nline2", ESCAPES: "line1\nline2",
  });
  expect(process.env.CREATOR_ENV_FIXTURE).toBe(before);
});

it.each([0, 1])("preserves the first abort reason and releases both fallback listeners: %s", first => {
  Object.defineProperty(AbortSignal, "any", { configurable: true, value: undefined });
  const controllers = [new AbortController(), new AbortController()] as const;
  const removals = controllers.map(controller => vi.spyOn(controller.signal, "removeEventListener"));
  const signal = combineAbortSignals(controllers.map(controller => controller.signal));
  const reason = new Error("first cancellation");
  controllers[first as 0 | 1].abort(reason);
  controllers[(1 - first) as 0 | 1].abort(new Error("later deadline"));
  expect(signal.aborted).toBe(true);
  expect(signal.reason).toBe(reason);
  expect(removals.every(remove => remove.mock.calls.length === 1)).toBe(true);
});

it("honors an already aborted caller without retaining earlier listeners", () => {
  Object.defineProperty(AbortSignal, "any", { configurable: true, value: undefined });
  const deadline = new AbortController(), caller = new AbortController();
  const remove = vi.spyOn(deadline.signal, "removeEventListener");
  caller.abort("already stopped");
  expect(combineAbortSignals([deadline.signal, caller.signal]).reason).toBe("already stopped");
  expect(remove).toHaveBeenCalledOnce();
});

it("compiles development sources with owner URLs, JSON and import-only dependencies", async () => {
  const root = await temporaryRoot();
  const source = path.join(root, "source 源码");
  const dependency = path.join(root, "node_modules/import-only");
  await mkdir(source, { recursive: true }); await mkdir(dependency, { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "source-owner", type: "module", exports: { import: "./self.js" } }));
  await writeFile(path.join(root, "self.js"), "export const self = 'owner';");
  await writeFile(path.join(dependency, "package.json"), JSON.stringify({ type: "module", exports: { import: "./index.js" } }));
  await writeFile(path.join(dependency, "index.js"), "export default 'import-only';");
  await writeFile(path.join(source, "data.json"), '{"value":42}');
  await writeFile(path.join(source, "owner.ts"), 'export const owner = import.meta.url; export const literal = "import.meta.url";');
  const entry = path.join(source, "entry.ts");
  await writeFile(entry, 'import data from "./data.json" with {type:"json"}; import dependency from "import-only"; import {self} from "source-owner"; import {owner,literal} from "./owner.js"; export const result={data,dependency,owner,literal,self};');
  const cache = path.join(root, "node_modules/.cache/development");
  const compiled = await compileDevelopmentEntry(entry, cache);
  expect(await compileDevelopmentEntry(entry, cache)).toBe(compiled);
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", 'console.log(JSON.stringify((await import(process.argv[1])).result))', pathToFileURL(compiled).href]);
  expect(JSON.parse(stdout)).toEqual({ data: { value: 42 }, dependency: "import-only", owner: pathToFileURL(await realpath(path.join(source, "owner.ts"))).href, literal: "import.meta.url", self: "owner" });
  await writeFile(path.join(source, "owner.ts"), 'export const owner = import.meta.url; export const literal = "changed";');
  expect(await compileDevelopmentEntry(entry, cache)).not.toBe(compiled);
});
