export interface SlotContribution {
  readonly instanceId: string;
  readonly slotId: string;
  readonly order?: number | undefined;
}

export type SlotDeclarationOwner =
  | {
      readonly kind: "layout";
      readonly nodeId: string;
    }
  | {
      readonly kind: "plugin";
      readonly instanceId: string;
    };

export interface SlotDeclaration {
  readonly slotId: string;
  readonly owner: SlotDeclarationOwner;
}

const EMPTY_CONTRIBUTIONS: readonly SlotContribution[] = Object.freeze([]);

/** Runtime Slot declarations and contributions; Plugin lifecycle remains external. */
export class SlotRegistry {
  readonly #byInstance = new Map<string, SlotContribution>();
  readonly #bySlot = new Map<string, readonly SlotContribution[]>();
  readonly #declarations = new Map<string, SlotDeclaration>();
  readonly #listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  getContributions(slotId: string): readonly SlotContribution[] {
    return this.#bySlot.get(slotId) ?? EMPTY_CONTRIBUTIONS;
  }

  getDeclaration(slotId: string): SlotDeclaration | undefined {
    return this.#declarations.get(slotId);
  }

  declare(declaration: SlotDeclaration): () => void {
    if (!declaration.slotId.trim()) {
      throw new Error("Slot declaration slotId must not be blank");
    }
    if (
      (declaration.owner.kind === "layout" && !declaration.owner.nodeId.trim()) ||
      (declaration.owner.kind === "plugin" && !declaration.owner.instanceId.trim())
    ) {
      throw new Error("Slot declaration owner id must not be blank");
    }
    if (this.#declarations.has(declaration.slotId)) {
      throw new Error(`Slot "${declaration.slotId}" already has a live declaration`);
    }

    const record: SlotDeclaration = Object.freeze({
      slotId: declaration.slotId,
      owner: Object.freeze({ ...declaration.owner }),
    });
    this.#declarations.set(record.slotId, record);
    this.#notify();

    return () => {
      if (this.#declarations.get(record.slotId) !== record) return;
      this.#declarations.delete(record.slotId);
      this.#notify();
    };
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
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // An observer must not interrupt activation or prevent cleanup.
      }
    }
  }
}
