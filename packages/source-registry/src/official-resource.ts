/** Product IDs stay stable when their internal source, package or adapter changes. */
export interface OfficialAgentUIResource {
  readonly kind?: "compatibility";
  readonly targets?: readonly ("vue" | "legacy" | "html")[];
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly discoverable?: boolean;
  /** Development-only implementation metadata. Never serialize into ordinary UI DTOs. */
  readonly implementation:
    | { readonly type: "source"; readonly sourceItemId: string }
    | { readonly type: "plugin"; readonly pluginId: string; readonly slot?: string; readonly dataMessageUIName?: string }
    | { readonly type: "source-plugin"; readonly sourceItemId: string; readonly pluginId: string;
        /** Explicit AppUIModel activation target; never inferred from the Plugin component or size. */
        readonly placement: "application" | "layout" | "plugin-slot"; readonly slot?: string; readonly layoutSize?: string };
}

export class OfficialResourceError extends Error {
  constructor(readonly code: "RESOURCE_UNKNOWN" | "RESOURCE_CONFLICT" | "RESOURCE_INSTALL_FAILED", message: string, readonly technicalDetails?: unknown) {
    super(message);
    this.name = "OfficialResourceError";
  }
}
