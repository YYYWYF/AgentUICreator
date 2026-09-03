export interface SlotContribution {
  readonly instanceId: string;
  readonly slotId: string;
  readonly order?: number | undefined;
}

const EMPTY_CONTRIBUTIONS: readonly SlotContribution[] = Object.freeze([]);

/** Runtime contributions only: no Layout nodes and no independent Plugin lifecycle. */
export class SlotRegistry {
  readonly #byInstance = new Map<string, SlotContribution>();
  readonly #bySlot = new Map<string, readonly SlotContribution[]>();
  readonly #listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  getContributions(slotId: string): readonly SlotContribution[] {
    return this.#bySlot.get(slotId) ?? EMPTY_CONTRIBUTIONS;
  }

  register(contribution: SlotContribution): () => void {
    if (!contribution.instanceId.trim() || !contribution.slotId.trim()) {
      throw new Error("Slot contribution instanceId and slotId must not be blank");
    }
    if (contribution.order !== undefined && !Number.isFinite(contribution.order)) {
      throw new Error("Slot contribution order must be finite");
    }
    if (this.#byInstance.has(contribution.instanceId)) {
      throw new Error(`Plugin instance "${contribution.instanceId}" already has a Slot contribution`);
    }

    const record = Object.freeze({ ...contribution });
    this.#byInstance.set(record.instanceId, record);
    this.#updateSlot(record.slotId);

    return () => {
      if (this.#byInstance.get(record.instanceId) !== record) return;
      this.#byInstance.delete(record.instanceId);
      this.#updateSlot(record.slotId);
    };
  }

  #updateSlot(slotId: string): void {
    const contributions = [...this.#byInstance.values()]
      .filter((contribution) => contribution.slotId === slotId)
      .sort((left, right) =>
        (left.order ?? 0) - (right.order ?? 0) ||
        (left.instanceId < right.instanceId ? -1 : left.instanceId > right.instanceId ? 1 : 0),
      );
    if (contributions.length === 0) {
      this.#bySlot.delete(slotId);
    } else {
      this.#bySlot.set(slotId, Object.freeze(contributions));
    }
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // An observer must not interrupt activation or prevent cleanup.
      }
    }
  }
}
