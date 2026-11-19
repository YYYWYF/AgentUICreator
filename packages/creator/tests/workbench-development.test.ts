import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { optimizeDeps, resolveConfig } from "vite";
import { context } from "esbuild";
import {
  DevelopmentRebuilder,
  developmentCachePlugin,
  developmentFingerprint,
  isDevelopmentInput,
  isWorkspacePackage,
  isSupervisedDevelopmentFile,
  writeDevelopmentCacheFile,
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

it.each(["EACCES", "EPERM", "EBUSY"])("retries temporary %s cache writes with a bounded backoff", async code => {
  const failure = Object.assign(new Error("file temporarily locked"), { code });
  const write = vi.fn<(file: string, contents: Uint8Array) => Promise<void>>();
  write.mockRejectedValueOnce(failure).mockRejectedValueOnce(failure).mockResolvedValue(undefined);
  const waits: number[] = [];
  const warn = vi.fn();
  await writeDevelopmentCacheFile("cache/probe.js.map", new Uint8Array([42]), {
    write, warn, wait: async milliseconds => { waits.push(milliseconds); },
  });
  expect(write).toHaveBeenCalledTimes(3);
  expect(waits).toEqual([50, 100]);
  expect(warn).toHaveBeenCalledOnce();
});

it("reports persistent permissions and non-transient write failures without hiding them", async () => {
  for (const code of ["EACCES", "ENOSPC"]) {
    const failure = Object.assign(new Error("write blocked"), { code });
    const write = vi.fn(async (_file: string, _contents: Uint8Array) => { throw failure; });
    const wait = vi.fn(async (_milliseconds: number) => {});
    await expect(writeDevelopmentCacheFile("cache/probe.js", new Uint8Array(), {
      write, wait, warn: () => {},
    })).rejects.toBe(failure);
    expect(write).toHaveBeenCalledTimes(code === "EACCES" ? 6 : 1);
    expect(wait).toHaveBeenCalledTimes(code === "EACCES" ? 5 : 0);
  }
});

it("commits real Vite dependency JS and maps after temporary Windows write denials", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "Agent UI Windows output 中文 space "));
  roots.push(root);
  const dependency = path.join(root, "node_modules/cache-probe");
  await mkdir(dependency, { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(path.join(dependency, "package.json"), JSON.stringify({ name: "cache-probe", main: "index.js" }));
  await writeFile(path.join(dependency, "index.js"), "module.exports = { value: 42 };\n");
  for (const role of ["workbench", "host-preview"] as const) {
    for (let round = 0; round < 2; round++) {
      const attempts = new Map<string, number>();
      let nativeWrite: boolean | undefined;
      const config = await resolveConfig({
        configFile: false, root, logLevel: "silent",
        plugins: [developmentCachePlugin(root, role, {
          platform: "win32", wait: async () => {}, warn: () => {},
          write: async (file, contents) => {
            const attempt = (attempts.get(file) ?? 0) + 1;
            attempts.set(file, attempt);
            if (attempt <= 2) throw Object.assign(new Error("Access is denied"), {
              code: file.endsWith(".map") ? "EPERM" : "EACCES",
            });
            await writeFile(file, contents);
          },
        })],
        optimizeDeps: {
          include: ["cache-probe"], noDiscovery: true,
          esbuildOptions: {
            logLevel: "silent",
            plugins: [{ name: "observe-native-writer", setup(build) {
              build.onStart(() => { nativeWrite = build.initialOptions.write; });
            } }],
          },
        },
      }, "serve");
      const metadata = await optimizeDeps(config, true);
      expect(nativeWrite).toBe(false);
      const output = metadata.optimized["cache-probe"]?.file;
      if (!output) throw new Error("Missing optimized dependency");
      expect(await readFile(output, "utf8")).toContain("42");
      const map: unknown = JSON.parse(await readFile(`${output}.map`, "utf8"));
      expect(map).toMatchObject({ version: 3, sources: expect.arrayContaining([expect.any(String)]) });
      expect(attempts.size).toBeGreaterThanOrEqual(2);
      expect([...attempts.values()].every(attempt => attempt === 3)).toBe(true);
    }
  }
});

it("fails real Vite optimization when the Windows host cannot write its output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "Agent UI denied output "));
  roots.push(root);
  await mkdir(path.join(root, "node_modules/cache-probe"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(path.join(root, "node_modules/cache-probe/package.json"), JSON.stringify({ main: "index.js" }));
  await writeFile(path.join(root, "node_modules/cache-probe/index.js"), "module.exports = 42;");
  const write = vi.fn(async (_file: string, _contents: Uint8Array) => {
    throw Object.assign(new Error("persistent output denial"), { code: "EACCES" });
  });
  const config = await resolveConfig({
    configFile: false, root, logLevel: "silent",
    plugins: [developmentCachePlugin(root, "workbench", {
      platform: "win32", write, wait: async () => {}, warn: () => {},
    })],
    optimizeDeps: { include: ["cache-probe"], noDiscovery: true, esbuildOptions: { logLevel: "silent" } },
  }, "serve");
  await expect(optimizeDeps(config, true)).rejects.toThrow("persistent output denial");
  expect(write).toHaveBeenCalledTimes(6);

  write.mockClear();
  await writeFile(path.join(root, "node_modules/cache-probe/index.js"), "module.exports = ;");
  await expect(optimizeDeps(config, true)).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
});

it("finishes an in-flight host write before esbuild cancellation and disposal complete", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "Agent UI cancelled output "));
  roots.push(root);
  let entered!: () => void;
  const writing = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let finished = false;
  const config = await resolveConfig({
    configFile: false, root, logLevel: "silent",
    plugins: [developmentCachePlugin(root, "workbench", {
      platform: "win32",
      write: async (file, contents) => {
        entered();
        await released;
        await writeFile(file, contents);
        finished = true;
      },
    })],
    optimizeDeps: { noDiscovery: true },
  }, "serve");
  const build = await context({
    stdin: { contents: "export const value = 42;" },
    outfile: path.join(root, "output.js"),
    plugins: config.optimizeDeps.esbuildOptions?.plugins ?? [],
    logLevel: "silent",
  });
  try {
    const running = build.rebuild();
    await writing;
    const settled = Promise.allSettled([running, build.cancel()]);
    release();
    const results = await settled;
    expect(results[1]?.status).toBe("fulfilled");
    expect(finished).toBe(true);
  } finally {
    release();
    await build.dispose();
  }
});

it("leaves Vite's in-memory scan output in memory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "Agent UI memory scan "));
  roots.push(root);
  const write = vi.fn(async (_file: string, _contents: Uint8Array) => {});
  const config = await resolveConfig({
    configFile: false, root, logLevel: "silent",
    plugins: [developmentCachePlugin(root, "workbench", { platform: "win32", write })],
    optimizeDeps: { noDiscovery: true },
  }, "serve");
  const build = await context({
    stdin: { contents: "export const value = 42;" },
    write: false,
    plugins: config.optimizeDeps.esbuildOptions?.plugins ?? [],
    logLevel: "silent",
  });
  try {
    const result = await build.rebuild();
    expect(result.outputFiles?.[0]?.path).toBe("<stdout>");
    expect(write).not.toHaveBeenCalled();
  } finally {
    await build.dispose();
  }
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
