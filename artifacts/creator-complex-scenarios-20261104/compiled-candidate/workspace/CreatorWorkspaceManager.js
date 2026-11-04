import { inspectIntegrationHost, readCompatibilityBinding, planCompatibilityProject, initializeCompatibilityProject, buildCompatibilityProject } from "@za38.03/agent-ui-creator/project/host";
import { ensureManagedOperator } from "@za38.03/agent-ui-creator/project";
import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
export class CreatorWorkspaceError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "CreatorWorkspaceError";
    }
}
export class CreatorWorkspaceManager {
    #compatibility;
    #ensureOperator;
    #inspect;
    #initialize;
    #validateSetup;
    #suggestSourceRoot;
    #createRuntime;
    #state = { status: "none" };
    #runtime;
    #activeRequests = new Set();
    #mutationPending = false;
    #queue = Promise.resolve();
    constructor(options) {
        this.#compatibility = options.compatibility ?? false;
        this.#ensureOperator = options.ensureOperator ?? ensureManagedOperator;
        this.#inspect = options.inspectProject;
        this.#initialize = options.initializeProject;
        this.#validateSetup = options.validateProjectSetup;
        this.#suggestSourceRoot = options.suggestSourceRoot;
        this.#createRuntime = options.createRuntimeManager;
    }
    getState() { return this.#state; }
    hasActiveCreatorRequests() { return this.#activeRequests.size > 0; }
    runProjectOperation(workspaceId, operation, options = {}) {
        if (options.mutation && (this.#mutationPending || this.hasActiveCreatorRequests()))
            return Promise.reject(new CreatorWorkspaceError("CREATOR_COMMAND_BUSY", "CREATOR_COMMAND_BUSY"));
        if (options.mutation)
            this.#mutationPending = true;
        const result = this.#exclusive(async () => {
            const state = this.#state;
            if ((state.status !== "ready") || state.workspace.id !== workspaceId) {
                throw new CreatorWorkspaceError("CREATOR_WORKSPACE_CHANGED", "当前项目已改变，请刷新面板后重试。");
            }
            if (options.mutation && this.hasActiveCreatorRequests())
                throw new CreatorWorkspaceError("CREATOR_COMMAND_BUSY", "CREATOR_COMMAND_BUSY");
            // A detached browser no longer implies an idle Agent process.
            if (options.mutation && await this.#runtime?.isBusy?.())
                throw new CreatorWorkspaceError("CREATOR_COMMAND_BUSY", "CREATOR_COMMAND_BUSY");
            return operation(state.workspace.projectRoot);
        });
        return result.finally(() => { if (options.mutation)
            this.#mutationPending = false; });
    }
    trackRequest(abort) {
        if (this.#mutationPending)
            throw new CreatorWorkspaceError("CREATOR_COMMAND_BUSY", "CREATOR_COMMAND_BUSY");
        this.#activeRequests.add(abort);
        return () => this.#activeRequests.delete(abort);
    }
    #exclusive(operation) {
        const result = this.#queue.then(operation, operation);
        this.#queue = result.catch(() => undefined);
        return result;
    }
    async #stopCurrent() {
        for (const abort of this.#activeRequests)
            abort();
        this.#activeRequests.clear();
        const runtime = this.#runtime;
        this.#runtime = undefined;
        if (runtime !== undefined)
            await runtime.dispose();
    }
    async #inspectCurrent(workspace, knownInspection) {
        let inspection;
        try {
            inspection = knownInspection ?? await this.#inspect(workspace.projectRoot);
        }
        catch (error) {
            const toolOutdated = typeof error === "object" && error !== null && "code" in error && error.code === "CREATOR_OPERATOR_RESTART_REQUIRED";
            if (toolOutdated && this.#state.status === "ready" && this.#state.workspace.id === workspace.id) {
                this.#state = { ...this.#state, runtime: { status: "unavailable", code: error.code,
                        message: error instanceof Error ? error.message : String(error) } };
                return this.#state;
            }
            inspection = { status: "broken", issues: [{ code: typeof error === "object" && error !== null && "code" in error && error.code === "CREATOR_OPERATOR_RESTART_REQUIRED" ? error.code : "CREATOR_WORKSPACE_INSPECTION_FAILED", message: error instanceof Error ? error.message : String(error) }] };
        }
        if (inspection.status === "ready") {
            const projectState = { status: inspection.status, workspace, project: inspection.projectConfig,
                ...(inspection.warnings === undefined ? {} : { warnings: inspection.warnings }) };
            this.#state = { ...projectState, runtime: { status: "starting" } };
            try {
                await this.#ensureOperator(workspace.projectRoot);
                this.#runtime = this.#createRuntime(workspace.projectRoot);
                await this.#runtime.ensureStarted();
                this.#state = { ...projectState, runtime: { status: "ready" } };
            }
            catch (error) {
                try {
                    await this.#runtime?.dispose();
                }
                catch { /* Preserve the startup error. */ }
                this.#runtime = undefined;
                this.#state = { ...projectState, runtime: {
                        status: "unavailable",
                        code: typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "CREATOR_RUNTIME_START_FAILED",
                        message: error instanceof Error ? error.message : String(error),
                    } };
            }
        }
        else if (inspection.status === "broken") {
            this.#state = { status: "broken", workspace, issues: inspection.issues };
        }
        else {
            this.#state = { status: "uninitialized", workspace };
        }
        return this.#state;
    }
    #requireUninitialized() {
        const state = this.#state;
        if (state.status === "uninitialized")
            return state.workspace;
        const code = state.status === "none" ? "CREATOR_WORKSPACE_REQUIRED"
            : state.status === "broken" ? "AGENT_UI_PROJECT_INVALID_STATE"
                : "AGENT_UI_PROJECT_ALREADY_INITIALIZED";
        throw new CreatorWorkspaceError(code, `Agent UI setup is unavailable while workspace status is ${state.status}.`);
    }
    suggestSourceRoot() {
        return this.#exclusive(() => { const workspace = this.#requireUninitialized(); return workspace.hostFramework === "vue" ? Promise.resolve("agent-ui") : this.#suggestSourceRoot(workspace.projectRoot); });
    }
    validateSetup(input) {
        return this.#exclusive(async () => {
            const projectRoot = this.#requireUninitialized().projectRoot;
            const result = this.#state.status !== "none" && this.#state.workspace.hostFramework === "vue"
                ? await planCompatibilityProject({ ...input, projectRoot }) : await this.#validateSetup({ ...input, projectRoot });
            return result.valid ? {
                ...result,
                sourceRoot: { ...result.sourceRoot, absolutePath: path.resolve(projectRoot, result.sourceRoot.normalized) },
            } : result;
        });
    }
    initializeProject(input) {
        return this.#exclusive(async () => {
            let workspace = this.#requireUninitialized();
            try {
                if (workspace.hostFramework === "vue") {
                    const result = await initializeCompatibilityProject({ ...input, projectRoot: workspace.hostProjectRoot ?? workspace.projectRoot });
                    workspace = { ...workspace, projectRoot: result.projectRoot, producerRoot: result.producerRoot };
                    this.#state = { status: "uninitialized", workspace };
                    await buildCompatibilityProject(result.projectRoot);
                }
                else {
                    const result = await this.#initialize({ ...input, projectRoot: workspace.projectRoot });
                    if (typeof result === "object" && result !== null && "status" in result && result.status === "dependencies-prepared") {
                        // Preparing package.json does not initialize project sources or start
                        // the Operator. Keep the known setup state so the user can install.
                        this.#state = { status: "uninitialized", workspace };
                        return this.#state;
                    }
                }
            }
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
            let inspection;
            try {
                inspection = await this.#inspect(workspace.projectRoot);
            }
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
    selectProject(projectRoot) {
        return this.#exclusive(async () => {
            const canonicalRoot = await realpath(projectRoot);
            if (!(await stat(canonicalRoot)).isDirectory()) {
                throw new CreatorWorkspaceError("CREATOR_WORKSPACE_NOT_DIRECTORY", "Project Root must be a directory.");
            }
            if ((this.#state.status === "ready") &&
                this.#state.runtime.status === "ready" && (this.#state.workspace.hostProjectRoot ?? this.#state.workspace.projectRoot) === canonicalRoot &&
                (!this.#state.workspace.hostFramework || (await readCompatibilityBinding(canonicalRoot))?.projectRoot === this.#state.workspace.projectRoot)) {
                try {
                    await this.#ensureOperator(this.#state.workspace.projectRoot);
                    return this.#state;
                }
                catch (error) {
                    const previous = this.#state;
                    await this.#stopCurrent();
                    this.#state = { ...previous, runtime: {
                            status: "unavailable", code: "CREATOR_OPERATOR_ENSURE_FAILED",
                            message: error instanceof Error ? error.message : String(error),
                        } };
                    return this.#state;
                }
            }
            await this.#stopCurrent();
            this.#state = { status: "none" };
            let workspace = {
                id: createHash("sha256").update(canonicalRoot).digest("hex"),
                projectRoot: canonicalRoot,
                name: path.basename(canonicalRoot),
                displayPath: canonicalRoot,
            };
            if (this.#compatibility && (await inspectIntegrationHost(canonicalRoot)).framework === "vue") {
                const binding = await readCompatibilityBinding(canonicalRoot);
                workspace = { ...workspace, hostProjectRoot: canonicalRoot, hostFramework: "vue",
                    ...(binding ? { projectRoot: binding.projectRoot, producerRoot: binding.producerRoot } : {}) };
            }
            return this.#inspectCurrent(workspace);
        });
    }
    buildCompatibility() {
        const state = this.#state;
        if (state.status !== "ready" || state.workspace.hostFramework !== "vue")
            return Promise.reject(new CreatorWorkspaceError("AGENT_UI_COMPATIBILITY_BINDING_INVALID", "AGENT_UI_COMPATIBILITY_BINDING_INVALID"));
        return this.runProjectOperation(state.workspace.id, root => buildCompatibilityProject(root), { mutation: true });
    }
    refresh() {
        return this.#exclusive(async () => {
            if (this.#state.status === "none")
                return this.#state;
            let workspace = this.#state.workspace;
            if (workspace.hostProjectRoot) {
                const binding = await readCompatibilityBinding(workspace.hostProjectRoot);
                if (binding)
                    workspace = { ...workspace, projectRoot: binding.projectRoot, producerRoot: binding.producerRoot };
            }
            await this.#stopCurrent();
            return this.#inspectCurrent(workspace);
        });
    }
    clear() {
        return this.#exclusive(async () => {
            await this.#stopCurrent();
            this.#state = { status: "none" };
        });
    }
    ensureCreatorRuntime() {
        const state = this.#state;
        if (state.status !== "ready") {
            const code = state.status === "none" ? "CREATOR_WORKSPACE_REQUIRED"
                : state.status === "uninitialized" ? "CREATOR_WORKSPACE_NOT_INITIALIZED"
                    : "CREATOR_WORKSPACE_INVALID";
            throw new CreatorWorkspaceError(code, `Creator is unavailable while workspace status is ${state.status}.`);
        }
        if (state.runtime.status !== "ready" || this.#runtime === undefined)
            throw new CreatorWorkspaceError("CREATOR_RUNTIME_UNAVAILABLE", state.runtime.status === "unavailable" ? state.runtime.message : "Creator runtime is unavailable.");
        return this.#runtime;
    }
}
//# sourceMappingURL=CreatorWorkspaceManager.js.map