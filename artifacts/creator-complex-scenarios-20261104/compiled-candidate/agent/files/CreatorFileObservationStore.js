import path from "node:path";
import { readCreatorFileState, resolveCreatorProjectFile, } from "./creatorFileState.js";
export class CreatorFileObservationError extends Error {
    code;
    filePath;
    constructor(code, filePath, message) {
        super(message);
        this.name = "CreatorFileObservationError";
        this.code = code;
        this.filePath = filePath;
    }
}
export class CreatorFileObservationStore {
    projectRoot;
    observations = new Map();
    runId = "unstarted";
    constructor(projectRoot) {
        this.projectRoot = path.resolve(projectRoot);
    }
    begin(runId) {
        this.runId = runId;
        this.observations.clear();
    }
    async observe(filePath) {
        const state = await readCreatorFileState(this.projectRoot, filePath);
        return this.record(filePath, state);
    }
    record(filePath, state) {
        const location = resolveCreatorProjectFile(this.projectRoot, filePath);
        const observation = {
            runId: this.runId,
            path: location.receiptPath,
            exists: state.exists,
            hash: state.hash,
        };
        this.observations.set(location.receiptPath, observation);
        return observation;
    }
    async observeStableRead(filePath, read, succeeded) {
        const before = await readCreatorFileState(this.projectRoot, filePath);
        const result = await read();
        const after = await readCreatorFileState(this.projectRoot, filePath);
        if (before.exists !== after.exists ||
            before.hash !== after.hash) {
            throw new CreatorFileObservationError("stale-version", filePath, `stale-version: ${filePath} changed while Creator was reading it. Read it again.`);
        }
        if (succeeded(result) || !after.exists) {
            this.record(filePath, after);
        }
        return result;
    }
    get(filePath) {
        const location = resolveCreatorProjectFile(this.projectRoot, filePath);
        return this.observations.get(location.receiptPath);
    }
    /** Discard a read that an aggregate operation could not return coherently. */
    forget(filePath) {
        this.observations.delete(resolveCreatorProjectFile(this.projectRoot, filePath).receiptPath);
    }
    async assertFreshForEdit(filePath) {
        const observation = this.get(filePath);
        if (observation === undefined || !observation.exists) {
            throw new CreatorFileObservationError("read-before-edit", filePath, `read-before-edit: Read ${filePath} successfully in this run before editing it.`);
        }
        return this.assertFresh(filePath, observation);
    }
    async assertFreshForWrite(filePath) {
        const current = await readCreatorFileState(this.projectRoot, filePath);
        const observation = this.get(filePath);
        if (!current.exists && observation === undefined) {
            return current;
        }
        if (observation === undefined) {
            throw new CreatorFileObservationError("read-before-write", filePath, `read-before-write: Read existing file ${filePath} successfully in this run before overwriting it.`);
        }
        if (observation.exists !== current.exists ||
            observation.hash !== current.hash) {
            throw new CreatorFileObservationError("stale-version", filePath, `stale-version: ${filePath} changed after Creator observed it. Read it again before writing.`);
        }
        return current;
    }
    async assertFresh(filePath, observation) {
        const current = await readCreatorFileState(this.projectRoot, filePath);
        if (observation.exists !== current.exists ||
            observation.hash !== current.hash) {
            throw new CreatorFileObservationError("stale-version", filePath, `stale-version: ${filePath} changed after Creator observed it. Read it again before editing.`);
        }
        return current;
    }
}
//# sourceMappingURL=CreatorFileObservationStore.js.map