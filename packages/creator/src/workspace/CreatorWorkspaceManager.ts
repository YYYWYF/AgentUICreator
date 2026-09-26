import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { PythonCreatorProcessManager } from "../PythonCreatorProcessManager.js";
import type {
  CreatorProjectInspection,
  CreatorProjectSetupValidation,
  CreatorPythonManagerFactory,
  CreatorWorkspaceDescriptor,
  CreatorWorkspaceInitializeInput,
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
  readonly #initialize: (input: CreatorWorkspaceInitializeInput & { projectRoot: string }) => Promise<unknown>;
  readonly #validateSetup: (input: CreatorWorkspaceInitializeInput & { projectRoot: string }) => Promise<CreatorProjectSetupValidation>;
  readonly #suggestSourceRoot: (projectRoot: string) => Promise<string>;
  readonly #createPython: CreatorPythonManagerFactory;
  #state: CreatorWorkspaceState = { status: "none" };
  #python: PythonCreatorProcessManager | undefined;
  #activeRequests = new Set<() => void>();
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: {
    inspectProject: (projectRoot: string) => Promise<CreatorProjectInspection>;
    initializeProject: (input: CreatorWorkspaceInitializeInput & { projectRoot: string }) => Promise<unknown>;
    validateProjectSetup: (input: CreatorWorkspaceInitializeInput & { projectRoot: string }) => Promise<CreatorProjectSetupValidation>;
    suggestSourceRoot: (projectRoot: string) => Promise<string>;
    createPythonManager: CreatorPythonManagerFactory;
  }) {
    this.#inspect = options.inspectProject;
    this.#initialize = options.initializeProject;
    this.#validateSetup = options.validateProjectSetup;
    this.#suggestSourceRoot = options.suggestSourceRoot;
    this.#createPython = options.createPythonManager;
  }

  getState(): CreatorWorkspaceState { return this.#state; }

  runProjectOperation<T>(workspaceId: string, operation: (projectRoot: string) => Promise<T>): Promise<T> {
    return this.#exclusive(async () => {
      const state = this.#state;
      if ((state.status !== "ready" && state.status !== "legacy") || state.workspace.id !== workspaceId) {
        throw new CreatorWorkspaceError("CREATOR_WORKSPACE_CHANGED", "当前项目已改变，请刷新面板后重试。");
      }
      return operation(state.workspace.projectRoot);
    });
  }

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

  async #inspectCurrent(workspace: CreatorWorkspaceDescriptor, knownInspection?: CreatorProjectInspection): Promise<CreatorWorkspaceState> {
    let inspection: CreatorProjectInspection;
    try {
      inspection = knownInspection ?? await this.#inspect(workspace.projectRoot);
    } catch (error) {
      inspection = { status: "broken", issues: [{ code: "CREATOR_WORKSPACE_INSPECTION_FAILED", message: error instanceof Error ? error.message : String(error) }] };
    }
    if (inspection.status === "ready" || inspection.status === "legacy") {
      const projectState = { status: inspection.status, workspace, project: inspection.projectConfig,
        ...(inspection.warnings === undefined ? {} : { warnings: inspection.warnings }) } as const;
      this.#state = { ...projectState, runtime: { status: "starting" } };
      try {
        this.#python = this.#createPython(workspace.projectRoot);
        await this.#python.ensureStarted();
        this.#state = { ...projectState, runtime: { status: "ready" } };
      } catch (error) {
        try { await this.#python?.dispose(); } catch { /* Preserve the startup error. */ }
        this.#python = undefined;
        this.#state = { ...projectState, runtime: {
          status: "unavailable",
          code: typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "CREATOR_RUNTIME_START_FAILED",
          message: error instanceof Error ? error.message : String(error),
        } };
      }
    } else if (inspection.status === "broken") {
      this.#state = { status: "broken", workspace, issues: inspection.issues };
    } else {
      this.#state = { status: "uninitialized", workspace };
    }
    return this.#state;
  }

  #requireUninitialized(): CreatorWorkspaceDescriptor {
    const state = this.#state;
    if (state.status === "uninitialized") return state.workspace;
    const code = state.status === "none" ? "CREATOR_WORKSPACE_REQUIRED"
      : state.status === "broken" ? "AGENT_UI_PROJECT_INVALID_STATE"
      : "AGENT_UI_PROJECT_ALREADY_INITIALIZED";
    throw new CreatorWorkspaceError(code, `Agent UI setup is unavailable while workspace status is ${state.status}.`);
  }

  suggestSourceRoot(): Promise<string> {
    return this.#exclusive(() => this.#suggestSourceRoot(this.#requireUninitialized().projectRoot));
  }

  validateSetup(input: CreatorWorkspaceInitializeInput): Promise<CreatorProjectSetupValidation> {
    return this.#exclusive(() => this.#validateSetup({ ...input, projectRoot: this.#requireUninitialized().projectRoot }));
  }

  initializeProject(input: CreatorWorkspaceInitializeInput): Promise<CreatorWorkspaceState> {
    return this.#exclusive(async () => {
      const workspace = this.#requireUninitialized();
      try { await this.#initialize({ ...input, projectRoot: workspace.projectRoot }); }
      catch (error) {
        if (typeof error === "object" && error !== null && "code" in error &&
            error.code === "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED") {
          const inspected = await this.#inspectCurrent(workspace);
          if (inspected.status === "uninitialized") {
            this.#state = { status: "broken", workspace, issues: [{
              code: "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED",
              message: "Initialized project still appears uninitialized; refresh before retrying.",
            }] };
          }
        }
        throw error;
      }
      let inspection: CreatorProjectInspection;
      try { inspection = await this.#inspect(workspace.projectRoot); }
      catch (error) {
        this.#state = { status: "broken", workspace, issues: [{ code: "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED", message: "Initialized project inspection failed." }] };
        throw new CreatorWorkspaceError("AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED", error instanceof Error ? error.message : String(error));
      }
      if (inspection.status !== "ready") {
        this.#state = { status: "broken", workspace, issues: [{ code: "AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED", message: `Initialized project inspected as ${inspection.status}.` }] };
        throw new CreatorWorkspaceError("AGENT_UI_INITIALIZATION_POSTCONDITION_FAILED", `Initialized Agent UI project inspected as ${inspection.status}.`);
      }
      return this.#inspectCurrent(workspace, inspection);
    });
  }

  selectProject(projectRoot: string): Promise<CreatorWorkspaceState> {
    return this.#exclusive(async () => {
      const canonicalRoot = await realpath(projectRoot);
      if (!(await stat(canonicalRoot)).isDirectory()) {
        throw new CreatorWorkspaceError("CREATOR_WORKSPACE_NOT_DIRECTORY", "Project Root must be a directory.");
      }
      if ((this.#state.status === "ready" || this.#state.status === "legacy") &&
          this.#state.runtime.status === "ready" && this.#state.workspace.projectRoot === canonicalRoot) {
        return this.#state;
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
    if (state.runtime.status !== "ready" || this.#python === undefined) throw new CreatorWorkspaceError("CREATOR_RUNTIME_UNAVAILABLE", state.runtime.status === "unavailable" ? state.runtime.message : "Creator runtime is unavailable.");
    return this.#python;
  }
}
