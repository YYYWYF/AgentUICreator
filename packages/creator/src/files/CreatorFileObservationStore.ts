import path from "node:path";

import {
  readCreatorFileState,
  resolveCreatorProjectFile,
  type CreatorFileState,
} from "./creatorFileState.js";

export interface CreatorFileObservation {
  runId: string;
  path: string;
  exists: boolean;
  hash: string;
}

export class CreatorFileObservationError extends Error {
  readonly code: "read-before-edit" | "read-before-write" | "stale-version";
  readonly filePath: string;

  constructor(
    code: CreatorFileObservationError["code"],
    filePath: string,
    message: string,
  ) {
    super(message);
    this.name = "CreatorFileObservationError";
    this.code = code;
    this.filePath = filePath;
  }
}

export class CreatorFileObservationStore {
  private readonly projectRoot: string;
  private readonly observations = new Map<string, CreatorFileObservation>();
  private runId = "unstarted";

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  begin(runId: string): void {
    this.runId = runId;
    this.observations.clear();
  }

  async observe(filePath: string): Promise<CreatorFileObservation> {
    const state = await readCreatorFileState(this.projectRoot, filePath);
    return this.record(filePath, state);
  }

  private record(
    filePath: string,
    state: CreatorFileState,
  ): CreatorFileObservation {
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

  async observeStableRead<T>(
    filePath: string,
    read: () => Promise<T>,
    succeeded: (result: T) => boolean,
  ): Promise<T> {
    const before = await readCreatorFileState(this.projectRoot, filePath);
    const result = await read();
    const after = await readCreatorFileState(this.projectRoot, filePath);
    if (
      before.exists !== after.exists ||
      before.hash !== after.hash
    ) {
      throw new CreatorFileObservationError(
        "stale-version",
        filePath,
        `stale-version: ${filePath} changed while Creator was reading it. Read it again.`,
      );
    }
    if (succeeded(result) || !after.exists) {
      this.record(filePath, after);
    }
    return result;
  }

  get(filePath: string): CreatorFileObservation | undefined {
    const location = resolveCreatorProjectFile(this.projectRoot, filePath);
    return this.observations.get(location.receiptPath);
  }

  async assertFreshForEdit(filePath: string): Promise<CreatorFileState> {
    const observation = this.get(filePath);
    if (observation === undefined || !observation.exists) {
      throw new CreatorFileObservationError(
        "read-before-edit",
        filePath,
        `read-before-edit: Read ${filePath} successfully in this run before editing it.`,
      );
    }
    return this.assertFresh(filePath, observation);
  }

  async assertFreshForWrite(filePath: string): Promise<CreatorFileState> {
    const current = await readCreatorFileState(this.projectRoot, filePath);
    const observation = this.get(filePath);
    if (!current.exists && observation === undefined) {
      return current;
    }
    if (observation === undefined) {
      throw new CreatorFileObservationError(
        "read-before-write",
        filePath,
        `read-before-write: Read existing file ${filePath} successfully in this run before overwriting it.`,
      );
    }
    if (
      observation.exists !== current.exists ||
      observation.hash !== current.hash
    ) {
      throw new CreatorFileObservationError(
        "stale-version",
        filePath,
        `stale-version: ${filePath} changed after Creator observed it. Read it again before writing.`,
      );
    }
    return current;
  }

  private async assertFresh(
    filePath: string,
    observation: CreatorFileObservation,
  ): Promise<CreatorFileState> {
    const current = await readCreatorFileState(this.projectRoot, filePath);
    if (
      observation.exists !== current.exists ||
      observation.hash !== current.hash
    ) {
      throw new CreatorFileObservationError(
        "stale-version",
        filePath,
        `stale-version: ${filePath} changed after Creator observed it. Read it again before editing.`,
      );
    }
    return current;
  }
}
