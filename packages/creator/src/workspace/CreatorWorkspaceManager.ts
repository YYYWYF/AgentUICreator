import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { PythonCreatorProcessManager } from "../PythonCreatorProcessManager.js";
import type {
  CreatorProjectInspection,
  CreatorPythonManagerFactory,
  CreatorWorkspaceDescriptor,
  CreatorWorkspaceState,
} from "./types.js";

export class CreatorWorkspaceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CreatorWorkspaceError";
  }
}

export class CreatorWorkspaceManager {
  readonly #inspect: (projectRoot: string) => Promise<CreatorProjectInspection>;
  readonly #createPython: CreatorPythonManagerFactory;
  #state: CreatorWorkspaceState = { status: "none" };
  #python: PythonCreatorProcessManager | undefined;
  #activeRequests = new Set<() => void>();
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: {
    inspectProject: (projectRoot: string) => Promise<CreatorProjectInspection>;
    createPythonManager: CreatorPythonManagerFactory;
  }) {
    this.#inspect = options.inspectProject;
    this.#createPython = options.createPythonManager;
  }

  getState(): CreatorWorkspaceState { return this.#state; }

  trackRequest(abort: () => void): () => void {
    this.#activeRequests.add(abort);
    return () => this.#activeRequests.delete(abort);
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.catch(() => undefined);
    return result;
  }

  async #stopCurrent(): Promise<void> {
    for (const abort of this.#activeRequests) abort();
    this.#activeRequests.clear();
    const python = this.#python;
    this.#python = undefined;
    if (python !== undefined) await python.dispose();
  }

  async #inspectCurrent(workspace: CreatorWorkspaceDescriptor): Promise<CreatorWorkspaceState> {
    let inspection: CreatorProjectInspection;
    try {
      inspection = await this.#inspect(workspace.projectRoot);
    } catch (error) {
      inspection = { status: "broken", issues: [{ code: "CREATOR_WORKSPACE_INSPECTION_FAILED", message: error instanceof Error ? error.message : String(error) }] };
    }
    if (inspection.status === "ready" || inspection.status === "legacy") {
      try {
        this.#python = this.#createPython(workspace.projectRoot);
        await this.#python.ensureStarted();
        this.#state = { status: inspection.status, workspace, project: inspection.projectConfig };
      } catch (error) {
        await this.#python?.dispose();
        this.#python = undefined;
        this.#state = { status: "broken", workspace, issues: [{ code: "CREATOR_WORKSPACE_RUNTIME_INVALID", message: error instanceof Error ? error.message : String(error) }] };
      }
    } else if (inspection.status === "broken") {
      this.#state = { status: "broken", workspace, issues: inspection.issues };
    } else {
      this.#state = { status: "uninitialized", workspace };
    }
    return this.#state;
  }

  selectProject(projectRoot: string): Promise<CreatorWorkspaceState> {
    return this.#exclusive(async () => {
      const canonicalRoot = await realpath(projectRoot);
      if (!(await stat(canonicalRoot)).isDirectory()) {
        throw new CreatorWorkspaceError("CREATOR_WORKSPACE_NOT_DIRECTORY", "Project Root must be a directory.");
      }
      await this.#stopCurrent();
      this.#state = { status: "none" };
      const workspace: CreatorWorkspaceDescriptor = {
        id: createHash("sha256").update(canonicalRoot).digest("hex"),
        projectRoot: canonicalRoot,
        name: path.basename(canonicalRoot),
        displayPath: canonicalRoot,
      };
      return this.#inspectCurrent(workspace);
    });
  }

  refresh(): Promise<CreatorWorkspaceState> {
    return this.#exclusive(async () => {
      if (this.#state.status === "none") return this.#state;
      const workspace = this.#state.workspace;
      await this.#stopCurrent();
      this.#state = { status: "none" };
      return this.#inspectCurrent(workspace);
    });
  }

  clear(): Promise<void> {
    return this.#exclusive(async () => {
      await this.#stopCurrent();
      this.#state = { status: "none" };
    });
  }

  ensureCreatorRuntime(): PythonCreatorProcessManager {
    const state = this.#state;
    if (state.status !== "ready" && state.status !== "legacy") {
      const code = state.status === "none" ? "CREATOR_WORKSPACE_REQUIRED"
        : state.status === "uninitialized" ? "CREATOR_WORKSPACE_NOT_INITIALIZED"
        : "CREATOR_WORKSPACE_INVALID";
      throw new CreatorWorkspaceError(code, `Creator is unavailable while workspace status is ${state.status}.`);
    }
    if (this.#python === undefined) throw new CreatorWorkspaceError("CREATOR_WORKSPACE_INVALID", "Creator runtime is unavailable.");
    return this.#python;
  }
}
