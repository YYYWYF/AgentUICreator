import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectLocalizedDefaults, snapshotPath } from "../src/agent/localized-defaults.js";
import { CreatorValidation } from "../src/agent/validation.js";
import { RunActivity } from "../src/agent/activity.js";
import { creatorContentHash } from "../src/agent/files/creatorFileState.js";
vi.mock("../src/agent/operator.js", () => ({ requestOperator: async () => ({ status: "passed", errors: [] }) }));
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const prefix = 'import {ConversationComposerPlugin as Composer} from "@za38.03/agent-ui-plugins/composer";\n';
const original = prefix + 'export function App(props:any){return <Composer {...props}/>;}';
it("matches verified physical Windows drive/UNC paths without assuming filename case", () => {
  const drive = 'C:\\Project 中文\\src\\Composer.tsx', unc = '\\\\server\\share\\Project 中文\\src\\Composer.tsx';
  expect(snapshotPath('c:/project 中文/src/Composer.tsx', path.win32, () => drive)).toBe(drive);
  expect(snapshotPath('//SERVER/share/Project 中文/src/Composer.tsx', path.win32, () => unc)).toBe(unc);
});
async function fixture(source: string) {
  const root = await mkdtemp(path.join(tmpdir(), "creator locale 默认 空格-")); roots.push(root);
  for (const name of ["src/ui", ".agent-ui", "node_modules/@za38.03/agent-ui-plugins/dist"]) await mkdir(path.join(root, name), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, ".agent-ui/project.json"), '{"sourceRoot":"src/ui"}');
  await writeFile(path.join(root, "tsconfig.json"), '{"compilerOptions":{"jsx":"react-jsx","module":"ESNext","moduleResolution":"Bundler"}}');
  await writeFile(path.join(root, "node_modules/@za38.03/agent-ui-plugins/package.json"), JSON.stringify({ name: "@za38.03/agent-ui-plugins", exports: { "./catalog.json": "./dist/catalog.json" } }));
  await writeFile(path.join(root, "node_modules/@za38.03/agent-ui-plugins/dist/catalog.json"), JSON.stringify({ publicComponents: { modules: {
    "@za38.03/agent-ui-plugins/composer": { ConversationComposerPlugin: { localizedDefaults: { placeholder: "composer.placeholder", "inputProps.placeholder": "composer.placeholder" } } },
  } } }));
  const file = "src/ui/Composer.tsx"; await writeFile(path.join(root, file), source);
  return { root, file };
}
it.each([
  'export function App(props:any){return <Composer {...props} placeholder="请输入你的问题"/>;}',
  'const text="请输入你的问题"; export function App({placeholder=text,...props}:any){return <Composer {...props} placeholder={placeholder}/>;}',
  'export function App({placeholder="请输入你的问题",...props}:any){return <Composer placeholder={placeholder} {...props}/>;}',
  'export function App(props:any){return <Composer placeholder={props.placeholder ?? "请输入你的问题"}/>;}',
  'const defaults={placeholder:"请输入你的问题",maxLength:200} as const;export function App(props:any){return <Composer {...props} placeholder={props.placeholder ?? defaults.placeholder} maxLength={props.maxLength ?? defaults.maxLength}/>;}',
  'const defaults={placeholder:"请输入你的问题"} satisfies Record<string,string>;export function App(){return <Composer placeholder={defaults["placeholder"]}/>;}',
])("identifies new fixed locale defaults through actual JSX and local bindings", async body => {
  const after = prefix + body, { root, file } = await fixture(after);
  const issues = await inspectLocalizedDefaults(root, [{ path: file, before: original, after }]);
  expect(issues).toEqual([expect.objectContaining({ path: file, property: "placeholder", namespace: "composer.placeholder", value: "请输入你的问题", code: "LOCALIZED_DEFAULT_REQUIRED" })]);
  expect(await readFile(path.join(root, file), "utf8")).toBe(after);
}, 20_000);
it("preserves existing literals and permits unified-locale values, brands, protocol IDs and business copy", async () => {
  const before = prefix + 'export function App(){return <Composer placeholder="Legacy"/>;}';
  const after = before + '\nexport function Business({messages}:any){return <><h1>ACME</h1><code>sample code</code><Composer placeholder={messages.placeholder} title="Brand name" data-testid="protocol_id"/></>}';
  const { root, file } = await fixture(after);
  expect(await inspectLocalizedDefaults(root, [{ path: file, before, after }])).toEqual([]);
}, 20_000);
it("also checks the declared native-input default instead of only its root-prop spelling", async () => {
  const after = prefix + 'const native={placeholder:"请输入你的问题"};export function App(){return <Composer inputProps={native}/>;}';
  const { root, file } = await fixture(after);
  expect(await inspectLocalizedDefaults(root, [{ path: file, before: original, after }])).toEqual([expect.objectContaining({ property: "inputProps.placeholder" })]);
}, 20_000);
it("enforces the locale delta in completion validation and permits a repaired project default", async () => {
  const { root, file } = await fixture(original);
  const signal = new AbortController().signal, activity = new RunActivity(root, "locale-delta", signal);
  await activity.capture(file);
  const after = prefix + 'export function App(){return <Composer placeholder="请输入你的问题"/>;}';
  await writeFile(path.join(root, file), after);
  activity.recordAfter(file, { exists: true, content: after, hash: creatorContentHash(after) }); activity.revision++;
  const validation = new CreatorValidation(root, activity, () => signal);
  vi.spyOn(validation as unknown as { script(name: string): Promise<unknown> }, "script").mockResolvedValue({ command: "typecheck", status: "passed", exitCode: 0, output: "", truncated: false, revision: 1 });
  const rejected = await validation.validate({});
  expect(rejected.status).toBe("failed"); expect(rejected.introduced.localizedDefaults).toHaveLength(1);
  expect(activity.validationRevision).not.toBe(activity.revision);
  const repaired = prefix + 'export function App({messages,...props}:any){return <Composer {...props} placeholder={messages.placeholder}/>;}';
  await writeFile(path.join(root, file), repaired); activity.recordAfter(file, { exists: true, content: repaired, hash: creatorContentHash(repaired) }); activity.revision++;
  expect((await validation.validate({})).status).toBe("passed"); expect(activity.validationRevision).toBe(activity.revision);
}, 25_000);
