import type { CreatorActivityRecorder } from "../CreatorActivityRecorder.js";
import type { CreatorRuntimeDiagnosticSession } from "../runtime-diagnostics/CreatorRuntimeDiagnosticStore.js";
import type { ProjectControlAdapter } from "./ProjectControlAdapter.js";
import {
  formatCreatorCurrentStateForPrompt,
  formatProjectNavigationSnapshotForPrompt,
  loadProjectSnapshot,
  type CreatorProjectSnapshot,
} from "./projectSnapshot.js";

interface SnapshotCacheKey {
  runId: string;
  mutationRevision: number;
  invalidationEpoch: number;
}

interface CachedNavigationSnapshot extends SnapshotCacheKey {
  snapshot: CreatorProjectSnapshot;
  navigationPrompt: string;
}

export interface CreatorProjectPromptContextValue {
  navigationPrompt: string;
  currentStatePrompt: string;
}

export interface CreatorProjectPromptContextMetrics {
  snapshotRefreshes: number;
  snapshotCacheHits: number;
  snapshotInvalidations: number;
  lastInvalidationReason?: string | undefined;
}

function sameKey(left: SnapshotCacheKey, right: SnapshotCacheKey): boolean {
  return (
    left.runId === right.runId &&
    left.mutationRevision === right.mutationRevision &&
    left.invalidationEpoch === right.invalidationEpoch
  );
}

export class CreatorProjectPromptContext {
  private cache: CachedNavigationSnapshot | undefined;
  private invalidationEpoch = 0;
  private snapshotRefreshes = 0;
  private snapshotCacheHits = 0;
  private snapshotInvalidations = 0;
  private lastInvalidationReason: string | undefined;

  constructor(
    private readonly adapter: Pick<ProjectControlAdapter, "request">,
    private readonly activity?: CreatorActivityRecorder | undefined,
    private readonly runtimeDiagnostics?: CreatorRuntimeDiagnosticSession | undefined,
  ) {}

  invalidate(reason = "explicit"): void {
    this.invalidationEpoch += 1;
    this.snapshotInvalidations += 1;
    this.lastInvalidationReason = reason;
  }

  observeSnapshot(snapshot: CreatorProjectSnapshot): void {
    const key = this.currentKey();
    if (
      snapshot.creator.runId !== key.runId ||
      snapshot.creator.mutationRevision !== key.mutationRevision
    ) {
      return;
    }
    this.cache = {
      ...key,
      snapshot,
      navigationPrompt: formatProjectNavigationSnapshotForPrompt(snapshot),
    };
  }

  metrics(): CreatorProjectPromptContextMetrics {
    return {
      snapshotRefreshes: this.snapshotRefreshes,
      snapshotCacheHits: this.snapshotCacheHits,
      snapshotInvalidations: this.snapshotInvalidations,
      ...(this.lastInvalidationReason === undefined
        ? {}
        : { lastInvalidationReason: this.lastInvalidationReason }),
    };
  }

  async current(): Promise<CreatorProjectPromptContextValue> {
    let key = this.currentKey();
    if (this.cache === undefined || !sameKey(this.cache, key)) {
      for (;;) {
        const loadKey = key;
        this.snapshotRefreshes += 1;
        const snapshot = await loadProjectSnapshot(
          this.adapter,
          this.activity,
          this.runtimeDiagnostics,
        );
        key = this.currentKey();
        if (!sameKey(loadKey, key)) {
          continue;
        }
        this.cache = {
          ...key,
          snapshot,
          navigationPrompt: formatProjectNavigationSnapshotForPrompt(snapshot),
        };
        break;
      }
    } else {
      this.snapshotCacheHits += 1;
    }

    const cache = this.cache;
    if (cache === undefined) {
      throw new Error(
        "Creator project prompt context cache was not initialized.",
      );
    }
    return {
      navigationPrompt: cache.navigationPrompt,
      currentStatePrompt: formatCreatorCurrentStateForPrompt({
        snapshot: cache.snapshot,
        snapshotRevision: cache.mutationRevision,
        activity: this.activity,
        runtimeDiagnostics: this.runtimeDiagnostics,
      }),
    };
  }

  private currentKey(): SnapshotCacheKey {
    return {
      runId: this.activity?.runId ?? "unavailable",
      mutationRevision: this.activity?.revision ?? 0,
      invalidationEpoch: this.invalidationEpoch,
    };
  }
}
