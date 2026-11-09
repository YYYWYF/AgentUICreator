import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";
import { terminateProcessTree } from "../../packages/creator/src/processTree.js";
import type { CreatorWorkspaceManager } from "../../packages/creator/src/workspace/CreatorWorkspaceManager.js";
import {
  isDevelopmentInput,
  packageSourceFingerprint,
  workspacePackageFingerprints,
  prepareWorkspacePackagesAsync,
} from "../../scripts/workspace-build-cache.mjs";
import { prepareDevelopmentCache } from "../../scripts/development-cache.mjs";
export { isDevelopmentInput };

const logical = (file: string) => file.replaceAll("\\", "/");

export function isWorkspacePackage(
  file: string,
  root: string,
  platform = process.platform,
): boolean {
  const paths = platform === "win32" ? path.win32 : path;
  const relative = paths.relative(paths.join(root, "packages"), file);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${paths.sep}`) &&
    !paths.isAbsolute(relative)
  );
}

/** Shared config imports must not let Vite bypass the supervisor's idle gate. */
export function isSupervisedDevelopmentFile(file: string, root: string, platform = process.platform): boolean {
  if (isWorkspacePackage(file, root, platform)) return true;
  const paths = platform === "win32" ? path.win32 : path;
  for (const directory of ["scripts", "releases", "artifacts/creator-documentation"]) {
    const relative = paths.relative(paths.join(root, ...directory.split("/")), file);
    if (relative !== ".." && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative)) return true;
  }
  const relative = logical(paths.relative(root, file));
  return ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", ".npmrc", ".pnpmfile.cjs", "pnpmfile.cjs"].includes(platform === "win32" ? relative.toLowerCase() : relative);
}

export async function developmentFingerprint(root: string): Promise<string> {
  return packageSourceFingerprint(root);
}

/** Serializes saves and retains changes made during an asynchronous build. */
export class DevelopmentRebuilder {
  #timer: ReturnType<typeof setTimeout> | undefined;
  #running = false;
  #closed = false;
  #pending = false;
  #needsRebuild = false;
  #baseline: string[];
  constructor(
    readonly options: {
      initial: string[];
      snapshot: () => Promise<string[]>;
      prepare: () => Promise<boolean>;
      rebuild: (firstChanged: number) => Promise<string[] | void>;
      error: (error: unknown) => void;
      delay?: number;
    },
  ) {
    this.#baseline = options.initial;
  }
  changed(delay = this.options.delay ?? 300) {
    if (this.#closed) return;
    this.#pending = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      void this.#drain();
    }, delay);
  }
  close() {
    this.#closed = true;
    clearTimeout(this.#timer);
  }
  async #drain() {
    if (this.#running || this.#closed) return;
    this.#running = true;
    let retryDelay: number | undefined;
    try {
      while (this.#pending && !this.#closed) {
        this.#pending = false;
        const before = await this.options.snapshot();
        const first = before.findIndex(
          (value, index) => value !== this.#baseline[index],
        );
        if (first < 0 && !this.#needsRebuild) continue;
        if (!(await this.options.prepare())) {
          this.#pending = true;
          retryDelay = 1000;
          break;
        }
        if (this.#closed) break;
        this.#needsRebuild = true;
        const prepared = await this.options.rebuild(Math.max(0, first));
        this.#needsRebuild = false;
        this.#baseline = prepared ?? before;
        this.#pending = true; // Recheck saves made during the build.
      }
    } catch (error) {
      if (!this.#closed) this.options.error(error);
    } finally {
      this.#running = false;
      if (this.#pending && !this.#closed) this.changed(retryDelay);
    }
  }
}

type ReloadMessage = {
  type?: string;
  id?: number;
  ready?: boolean;
  projectRoot?: string;
};

/** Clear each service's previous Vite cache at startup, without lock/preflight gates. */
export function developmentCachePlugin(root: string, role: "workbench" | "host-preview"): Plugin {
  return {
    name: "agent-ui-development-cache",
    apply: "serve",
    config() {
      return { cacheDir: prepareDevelopmentCache(root, role) };
    },
    configResolved(config) {
      config.logger.info(`[Creator] ${role} dependency cache: clean startup directory`);
    },
  };
}

/** Installed Creator Hosts do not opt into this repository-only IPC protocol. */
export function developmentReloadPlugin(
  root: string,
  manager?: CreatorWorkspaceManager,
): Plugin {
  const supervised = process.env.AGENT_UI_DEV_WATCH === "1" && !!process.send;
  return {
    name: "agent-ui-workspace-development-reload",
    apply: "serve",
    config() {
      // Application files retain Vite HMR. Package files are rebuilt with both
      // servers stopped, so neither Vite nor Node reads half-written output.
      if (supervised)
        return {
          server: {
            watch: {
              ignored: [(file: string) => isSupervisedDevelopmentFile(file, root)],
            },
          },
        };
    },
    configureServer(server) {
      if (!supervised) return;
      let closing = false;
      const receive = (message: ReloadMessage) => {
        if (message?.type === "agent-ui:shutdown" && !closing) {
          closing = true;
          void (async () => {
            try {
              await manager?.clear();
              await server.close();
              process.exit(0);
            } catch (error) {
              server.config.logger.error(String(error));
              process.exit(1);
            }
          })();
          return;
        }
        if (message?.type !== "agent-ui:prepare-reload" || !manager || closing)
          return;
        void manager
          .prepareForDevelopmentRestart()
          .then((ready) => {
            const state = manager.getState();
            const projectRoot =
              state.status === "none"
                ? ""
                : (state.workspace.hostProjectRoot ??
                  state.workspace.projectRoot);
            if (process.connected)
              process.send?.({
                type: "agent-ui:reload-ready",
                id: message.id,
                ready,
                projectRoot,
              });
          })
          .catch((error) => {
            server.config.logger.error(String(error));
            if (process.connected)
              process.send?.({
                type: "agent-ui:reload-ready",
                id: message.id,
                ready: false,
              });
          });
      };
      process.on("message", receive);
      server.httpServer?.once("close", () => process.off("message", receive));
    },
  };
}

export async function startDevelopment(options: {
  workspaceRoot: string;
  args: string[];
  packages: string[];
  spawnPnpm: (args: string[], options: SpawnOptions) => ChildProcess;
}) {
  const { workspaceRoot: root, args, packages, spawnPnpm } = options;
  const port = (option: string, fallback: number) => {
    const index = args.indexOf(option);
    const value = index === -1 ? fallback : Number(args[index + 1]);
    if (!Number.isInteger(value) || value < 1 || value > 65535)
      throw new Error(`Invalid ${option}`);
    return value;
  };
  const hostPort = port("--host-port", 5180),
    workbenchPort = port("--workbench-port", 5174);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AGENT_UI_DEV_WATCH: "1",
    VITE_CREATOR_DOCK_URL:
      process.env.VITE_CREATOR_DOCK_URL ||
      `http://127.0.0.1:${workbenchPort}/dock.html`,
    VITE_CREATOR_HOST_PREVIEW_URL:
      process.env.VITE_CREATOR_HOST_PREVIEW_URL ||
      `http://127.0.0.1:${hostPort}/?creator-preview`,
  };
  const children = new Set<ChildProcess>();
  let servers: ChildProcess[] = [];
  let stopping = false,
    requestId = 0,
    waiting = false,
    teardownFailed = false;
  const snapshot = async () => workspacePackageFingerprints(packages, { root });
  const closeChild = async (child: ChildProcess) => {
    if (child.connected) {
      // Release the separately spawned Creator worker before terminating Vite.
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          child.off("close", finish);
          resolve();
        };
        const timer = setTimeout(finish, 1000);
        child.once("close", finish);
        child.send({ type: "agent-ui:shutdown" }, (error) => {
          if (error) finish();
        });
      });
    }
    if (child.exitCode === null && child.signalCode === null)
      await terminateProcessTree(child, 500);
  };
  const stopServers = async () => {
    const current = servers;
    servers = [];
    try {
      await Promise.all(current.map(closeChild));
    } catch (error) {
      teardownFailed = true;
      throw error;
    }
  };
  const startServers = () => {
    if (stopping) return;
    const entries = [
      [
        "examples/creator-host-sandbox",
        hostPort,
        [
          "--config",
          path.join(root, "apps/creator-workbench/host-preview.vite.config.ts"),
        ],
      ],
      ["apps/creator-workbench", workbenchPort, []],
    ] as const;
    servers = entries.map(([directory, listenPort, configArgs]) => {
      const cwd = path.join(root, directory);
      const require = createRequire(path.join(cwd, "package.json"));
      const entry = path.join(
        path.dirname(require.resolve("vite/package.json")),
        "bin/vite.js",
      );
      const child = spawn(
        process.execPath,
        [
          entry,
          ...configArgs,
          "--host",
          "127.0.0.1",
          "--port",
          String(listenPort),
          "--strictPort",
        ],
        {
          cwd,
          env,
          detached: process.platform !== "win32",
          stdio: ["inherit", "inherit", "inherit", "ipc"],
        },
      );
      children.add(child);
      child.once("error", (error) => {
        console.error(error);
        void stop(1);
      });
      child.once("close", (code) => {
        children.delete(child);
        if (!stopping && servers.includes(child)) void stop(code || 1);
      });
      return child;
    });
    console.log(
      `[Creator] Platform + Creator Agent: http://127.0.0.1:${hostPort}/`,
    );
    console.log(`[Creator] Workbench: http://127.0.0.1:${workbenchPort}/`);
  };
  const prepare = async () => {
    if (teardownFailed)
      throw new Error(
        "Development server shutdown failed; stop pnpm dev and check its processes before restarting.",
      );
    const workbench = servers[1];
    if (!workbench) return true; // A failed build is waiting for another save.
    const id = ++requestId;
    const ready = await new Promise<boolean>((resolve) => {
      const finish = (value: boolean) => {
        clearTimeout(timer);
        workbench.off("message", receive);
        workbench.off("close", closed);
        resolve(value);
      };
      const receive = (message: ReloadMessage) => {
        if (message?.type === "agent-ui:reload-ready" && message.id === id) {
          if (message.ready && typeof message.projectRoot === "string")
            env.AGENT_UI_DEV_PROJECT_ROOT = message.projectRoot;
          finish(message.ready === true);
        }
      };
      const closed = () => finish(false);
      const timer = setTimeout(() => finish(false), 5000);
      workbench.on("message", receive);
      workbench.once("close", closed);
      workbench.send({ type: "agent-ui:prepare-reload", id }, (error) => {
        if (error) finish(false);
      });
    });
    if (!ready && !waiting)
      console.log(
        "[Creator] Reload pending; waiting for Creator startup, active work or confirmation to finish.",
      );
    waiting = !ready;
    return ready;
  };
  const rebuild = async () => {
    await stopServers();
    if (stopping) return;
    // Run dependency repair only after admission closes and both servers stop.
    // Track its process tree just like package builds, including on Windows.
    const dependencyChild = spawn(process.execPath, [path.join(root, "scripts/ensure-workspace-dependencies.mjs")], {
      cwd: root, env, stdio: "inherit", detached: process.platform !== "win32",
    });
    children.add(dependencyChild);
    try {
      await new Promise<void>((resolve, reject) => {
        dependencyChild.once("error", reject);
        dependencyChild.once("close", code => code === 0 ? resolve() : reject(new Error(`Dependency preparation failed (${code}); fix the error and save again.`)));
      });
    } finally {
      children.delete(dependencyChild);
    }
    if (stopping) return;
    // The install receipt may change here. Remember the inputs actually handed
    // to the build, while retaining any later saves for the next drain pass.
    const prepared = await snapshot();
    await prepareWorkspacePackagesAsync(packages, async (name) => {
      if (stopping) return false;
      console.log(`[Creator] Rebuilding ${name}...`);
      const child = spawnPnpm(
        ["--filter", `@za38.03/agent-ui-${name}`, "build"],
        {
          cwd: root,
          env,
          stdio: "inherit",
          detached: process.platform !== "win32",
        },
      );
      children.add(child);
      try {
        await new Promise<void>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", (code) =>
            code === 0
              ? resolve()
              : reject(
                  new Error(
                    `${name} build failed (${code}); fix the error and save again.`,
                  ),
                ),
          );
        });
      } finally {
        children.delete(child);
      }
      return true;
    }, { root });
    startServers();
    return prepared;
  };
  const reloader = new DevelopmentRebuilder({
    initial: await snapshot(),
    snapshot,
    prepare,
    rebuild,
    error: (error) => console.error(`[Creator] ${String(error)}`),
  });
  const watchers: ReturnType<typeof watch>[] = [];
  // Avoid recursively watching dependency stores and compiler outputs, including
  // Operator's own node_modules. New files/directories under src are covered.
  for (const name of packages) {
    const packageRoot = path.join(root, "packages", name);
    const directories = [
      "",
      "src",
      "scripts",
      "resources",
      "registry",
      "fixtures",
      "presets",
      "skills",
      "browser",
      "contracts",
      "operator",
      "operator/src",
      "operator/scripts",
      "operator/presets",
      "operator/fixtures",
      "operator/contracts",
    ];
    for (const directory of directories) {
      const target = path.join(packageRoot, directory);
      try {
        if (!(await stat(target)).isDirectory()) continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      watchers.push(
        watch(
          target,
          { recursive: directory !== "" && directory !== "operator" },
          (_event, file) => {
            if (
              !file ||
              isDevelopmentInput(
                path.posix.join(directory, logical(String(file))),
              )
            )
              reloader.changed();
          },
        ),
      );
    }
  }
  // Shared build/install inputs use the same idle gate and serialized restart.
  for (const directory of ["", "scripts", "releases", "artifacts/creator-documentation"]) {
    const target = path.join(root, directory);
    try {
      if (!(await stat(target)).isDirectory()) continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    watchers.push(watch(target, { recursive: directory === "artifacts/creator-documentation" }, (_event, file) => {
      if (!file || isDevelopmentInput(logical(String(file))) ||
          (directory === "" && isSupervisedDevelopmentFile(path.join(root, String(file)), root))) reloader.changed();
    }));
  }
  for (const watcher of watchers)
    watcher.on("error", (error) => {
      console.error(error);
      void stop(1);
    });
  let finish!: () => void;
  const stopped = new Promise<void>((resolve) => {
    finish = resolve;
  });
  async function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    reloader.close();
    for (const watcher of watchers) watcher.close();
    try {
      await Promise.all([...children].map(closeChild));
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      finish();
    }
  }
  const interrupt = () => {
    void stop();
  };
  // pnpm may forward a signal already delivered to the foreground group.
  // Keep handlers installed throughout cleanup so a second signal cannot orphan
  // the detached Vite/Creator children before their shutdown completes.
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  startServers();
  console.log(
    "[Creator] Watching workspace package sources; saves rebuild and reload automatically.",
  );
  await stopped;
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
}
