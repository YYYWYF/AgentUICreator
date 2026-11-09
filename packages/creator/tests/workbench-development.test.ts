import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DevelopmentRebuilder,
  developmentFingerprint,
  isDevelopmentInput,
  isWorkspacePackage,
  isSupervisedDevelopmentFile,
} from "../../../apps/creator-workbench/dev.js";

const roots: string[] = [];
const reloaders: DevelopmentRebuilder[] = [];
afterEach(async () => {
  for (const reloader of reloaders.splice(0)) reloader.close();
  vi.useRealTimers();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("keeps Windows drive case, UNC and spaces within the correct package boundary", () => {
  expect(
    isWorkspacePackage(
      "c:\\Company Projects\\UI\\packages\\creator\\src\\agent.ts",
      "C:\\Company Projects\\UI",
      "win32",
    ),
  ).toBe(true);
  expect(
    isWorkspacePackage(
      "C:\\Company Projects\\UI\\packages-extra\\agent.ts",
      "C:\\Company Projects\\UI",
      "win32",
    ),
  ).toBe(false);
  expect(
    isWorkspacePackage(
      "D:\\packages\\creator",
      "C:\\Company Projects\\UI",
      "win32",
    ),
  ).toBe(false);
  expect(
    isWorkspacePackage(
      "\\\\server\\share\\UI\\packages\\core\\index.ts",
      "\\\\server\\share\\UI",
      "win32",
    ),
  ).toBe(true);
});

it("routes shared build imports through the supervisor while retaining application HMR", () => {
  const root = "C:\\Company Projects\\UI";
  for (const file of ["scripts\\workspace-build-cache.mjs", "scripts\\pnpm-process.mjs", "releases\\compatibility.json", "artifacts\\creator-documentation\\index.json", "pnpm-lock.yaml", ".npmrc", ".pnpmfile.cjs"]) {
    expect(isSupervisedDevelopmentFile(path.win32.join(root, file), root, "win32")).toBe(true);
  }
  for (const file of ["scripts-extra\\index.mjs", "apps\\creator-workbench\\src\\App.tsx", "examples\\creator-host-sandbox\\src\\main.tsx"]) {
    expect(isSupervisedDevelopmentFile(path.win32.join(root, file), root, "win32")).toBe(false);
  }
});

it("tracks canonical additions, edits and removals without looping on build outputs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "Agent UI dev 中文 space "));
  roots.push(root);
  const put = async (file: string, value: string) => {
    const target = path.join(root, ...file.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, value);
  };
  await put(
    "package.json",
    JSON.stringify({ name: "fixture", agentUI: { version: 1 } }),
  );
  await put(
    "source-layout.json",
    JSON.stringify({ files: [{ view: "resources/registry/view.ts" }] }),
  );
  await put("src/component.ts", "export const value = 1");
  const before = await developmentFingerprint(root);
  await put("dist/index.js", "generated");
  await put("operator/dist/runtime/entry.mjs", "generated");
  await put("src/internal/vendor-generated/assistant-ui/view.ts", "generated");
  await put("resources/registry/view.ts", "generated");
  await put(
    "package.json",
    JSON.stringify({ name: "fixture", agentUI: { version: 2 } }),
  );
  expect(await developmentFingerprint(root)).toBe(before);
  for (const file of [
    "dist\\index.js",
    "operator\\dist\\entry.mjs",
    "src\\internal\\adapters-generated\\view.ts",
    "tests\\demo.ts",
  ]) {
    expect(isDevelopmentInput(file)).toBe(false);
  }
  expect(isDevelopmentInput("operator\\src\\project\\inspect.ts")).toBe(true);
  await put("src/new.ts", "new source");
  expect(await developmentFingerprint(root)).not.toBe(before);
  await rm(path.join(root, "src/new.ts"));
  expect(await developmentFingerprint(root)).toBe(before);
  await put("src/component.ts", "export const value = 2");
  expect(await developmentFingerprint(root)).not.toBe(before);
  expect(await readFile(path.join(root, "src/component.ts"), "utf8")).toContain(
    "2",
  );
});

function fixture(
  rebuild: (first: number) => Promise<void>,
  prepare = vi.fn(async () => true),
) {
  vi.useFakeTimers();
  let current = ["core-1", "creator-1"];
  const error = vi.fn();
  const reloader = new DevelopmentRebuilder({
    initial: [...current],
    snapshot: async () => [...current],
    prepare,
    rebuild,
    error,
  });
  reloaders.push(reloader);
  return {
    reloader,
    error,
    prepare,
    edit: (next: string[]) => {
      current = next;
      reloader.changed();
    },
  };
}

it("debounces saves and waits for the idle gate before rebuilding", async () => {
  const rebuild = vi.fn(async () => {});
  const prepare = vi.fn(async () => false);
  const state = fixture(rebuild, prepare);
  state.edit(["core-1", "creator-2"]);
  await vi.advanceTimersByTimeAsync(200);
  state.edit(["core-1", "creator-3"]);
  await vi.advanceTimersByTimeAsync(300);
  expect(prepare).toHaveBeenCalledOnce();
  expect(rebuild).not.toHaveBeenCalled();
  prepare.mockResolvedValue(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(rebuild).toHaveBeenCalledExactlyOnceWith(1);
  await vi.advanceTimersByTimeAsync(3000);
  expect(rebuild).toHaveBeenCalledOnce();
});

it("serializes builds and includes a save made during the previous build", async () => {
  let release!: () => void;
  const rebuild = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  const state = fixture(rebuild);
  state.edit(["core-1", "creator-2"]);
  await vi.advanceTimersByTimeAsync(300);
  state.edit(["core-2", "creator-3"]);
  await vi.advanceTimersByTimeAsync(500);
  expect(rebuild).toHaveBeenCalledOnce();
  release();
  await vi.advanceTimersByTimeAsync(1);
  expect(rebuild.mock.calls.map((call) => call[0])).toEqual([1, 0]);
  expect(state.error).not.toHaveBeenCalled();
});

it("keeps watching after a failed build and cancels queued work on shutdown", async () => {
  const rebuild = vi
    .fn()
    .mockRejectedValueOnce(new Error("compile failed"))
    .mockResolvedValue(undefined);
  const state = fixture(rebuild);
  state.edit(["core-1", "broken"]);
  await vi.advanceTimersByTimeAsync(300);
  expect(state.error).toHaveBeenCalledOnce();
  state.edit(["core-1", "fixed"]);
  await vi.advanceTimersByTimeAsync(300);
  expect(rebuild).toHaveBeenCalledTimes(2);
  state.edit(["core-2", "fixed"]);
  state.reloader.close();
  await vi.advanceTimersByTimeAsync(1000);
  expect(rebuild).toHaveBeenCalledTimes(2);
});

it("restarts after a failed build even when the fix restores the previous source", async () => {
  const rebuild = vi.fn()
    .mockRejectedValueOnce(new Error("compile failed"))
    .mockResolvedValue(undefined);
  const state = fixture(rebuild);
  state.edit(["core-1", "broken"]);
  await vi.advanceTimersByTimeAsync(300);
  state.edit(["core-1", "creator-1"]);
  await vi.advanceTimersByTimeAsync(300);
  expect(rebuild).toHaveBeenCalledTimes(2);
  expect(state.error).toHaveBeenCalledOnce();
});
