import type { Message } from "@ag-ui/core";
import type { ComponentType, ReactNode } from "react";
import { z } from "zod";

import type {
  AppUIModel,
  PluginInstance,
  UISlot,
  UISlotKind,
  UISlotOccupant,
  UISlotOwnerPropContract,
  UISlotScope,
} from "./app-ui-model";

export type AGUIMessage = Message;

export type UIPluginRunStatus = "idle" | "running" | "error";

export interface UIPluginRunState {
  status: UIPluginRunStatus;
  errorMessage: string | undefined;
}

export interface UIPluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities?: string[] | undefined;
  data?:
    | {
        messages?: boolean | undefined;
        state?: boolean | undefined;
      }
    | undefined;
}

export interface UIPluginActions {
  sendMessage(input: string): Promise<void>;
  startNewConversation(): Promise<void>;
  abortRun(): void;
  updateInstanceProps(props: Record<string, unknown>): void;
}

/**
 * Plugins may augment this interface to type their named services.
 *
 * @example
 * declare module "../../framework/contracts/ui-plugin" {
 *   interface UIPluginServiceMap {
 *     "acme.search": SearchService;
 *   }
 * }
 */
export interface UIPluginServiceMap {}

export interface UIPluginServices {
  get<K extends keyof UIPluginServiceMap & string>(
    name: K,
  ): UIPluginServiceMap[K] | undefined;
  get<T = unknown>(name: string): T | undefined;
}

export interface UIPluginServiceRegistrar extends UIPluginServices {
  provide<K extends keyof UIPluginServiceMap & string>(
    name: K,
    value: UIPluginServiceMap[K],
  ): () => void;
  provide<T>(name: string, value: T): () => void;
}

export interface UIPluginSetupContext {
  instance: PluginInstance;
  actions: UIPluginActions;
  services: UIPluginServiceRegistrar;
}

export type UIPluginSetupCleanup = void | (() => void);

/** One child Slot contract exposed by a Plugin Definition under a local outlet name. */
export interface UIPluginSlotDefinition {
  kind: UISlotKind;
  scope: UISlotScope;
  description: string;
  ownerProps?: UISlotOwnerPropContract[] | undefined;
  fallback?: "none" | "owner" | undefined;
}

export interface UIPluginSlotRenderOptions {
  /** Key dispatched by a keyed Slot. Omit for other cardinalities. */
  key?: string | undefined;
  /** Owner-rendered content used when the Slot has no selected occupant. */
  fallback?: ReactNode | undefined;
}

/** Exact Slot occurrence that rendered the current Plugin instance. */
export interface UIPluginSlotContext {
  id: string;
  kind: UISlotKind;
  scope: UISlotScope;
  ownerProps: object;
  occupant: UISlotOccupant;
  /** Non-null selection returned by a chain occupant. */
  matched?: unknown;
}

/** Child Slot renderer authorized by the current Plugin instance's declaration table. */
export interface UIPluginSlots {
  render(
    outlet: string,
    ownerProps?: object,
    options?: UIPluginSlotRenderOptions,
  ): ReactNode;
}

export interface UIPluginContext {
  messages: AGUIMessage[];
  state: unknown;
  run: UIPluginRunState;
  instance: PluginInstance;
  actions: UIPluginActions;
  services: UIPluginServices;
  slot: UIPluginSlotContext;
  slots: UIPluginSlots;
}

export interface UIPluginComponentProps {
  context: UIPluginContext;
}

export interface UIPluginDefinition {
  manifest: UIPluginManifest;
  /** Named services that must exist before this plugin instance becomes active. */
  inject?: readonly string[] | undefined;
  /** Instance-lifetime setup. Services provided here are removed on deactivation. */
  setup?:
    | ((context: UIPluginSetupContext) => UIPluginSetupCleanup)
    | undefined;
  /** Child Slot contracts this occupant is authorized to render. */
  slots?: Readonly<Record<string, UIPluginSlotDefinition>> | undefined;
  /** Required when this Plugin is mounted into a chain Slot. Null declines the occurrence. */
  selectSlot?: ((ownerProps: object) => unknown | null) | undefined;
  Component: ComponentType<UIPluginComponentProps>;
}

export interface UIPluginSlotContractIssue {
  code: "slot-declaration-missing" | "slot-contract-mismatch" | "slot-configuration-missing" | "chain-selector-missing";
  message: string;
}

function normalizedSlotDefinition(
  definition: UIPluginSlotDefinition,
): object {
  return {
    kind: definition.kind,
    scope: definition.scope,
    description: definition.description,
    ownerProps: definition.ownerProps ?? [],
    fallback: definition.fallback ?? "none",
  };
}

function normalizedConfiguredSlot(slot: UISlot): object {
  return {
    kind: slot.kind,
    scope: slot.scope,
    description: slot.description,
    ownerProps: slot.ownerProps ?? [],
    fallback: slot.fallback ?? "none",
  };
}

export function assertUIPluginSlotContract(
  slot: UISlot,
  outlet: string,
  definition: UIPluginDefinition,
): void {
  const declared = definition.slots?.[outlet];
  if (declared === undefined) {
    throw new Error(
      `UI plugin "${definition.manifest.id}" did not declare child Slot outlet "${outlet}".`,
    );
  }
  if (
    JSON.stringify(normalizedSlotDefinition(declared)) !==
    JSON.stringify(normalizedConfiguredSlot(slot))
  ) {
    throw new Error(
      `Child Slot "${slot.id}" contract does not match ${definition.manifest.id}.${outlet}.`,
    );
  }
}

export function inspectUIPluginSlotContracts(
  model: AppUIModel,
  definitions: readonly UIPluginDefinition[],
  options: { checkChainSelectors?: boolean } = {},
): UIPluginSlotContractIssue[] {
  const issues: UIPluginSlotContractIssue[] = [];
  const definitionById = new Map(
    definitions.map((definition) => [definition.manifest.id, definition]),
  );
  const childSlotByOwnerOutlet = new Map<string, UISlot>();

  for (const slot of Object.values(model.slots)) {
    if (slot.owner.type === "plugin-instance") {
      childSlotByOwnerOutlet.set(
        `${slot.owner.instanceId}\u0000${slot.owner.outlet}`,
        slot,
      );
      const instance = model.pluginInstances[slot.owner.instanceId];
      const definition = instance === undefined
        ? undefined
        : definitionById.get(instance.pluginId);
      if (definition === undefined || definition.slots?.[slot.owner.outlet] === undefined) {
        issues.push({
          code: "slot-declaration-missing",
          message: `Child Slot "${slot.id}" has no declaration at ${instance?.pluginId ?? "unknown"}.${slot.owner.outlet}.`,
        });
      } else {
        try {
          assertUIPluginSlotContract(slot, slot.owner.outlet, definition);
        } catch (error) {
          issues.push({
            code: "slot-contract-mismatch",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (slot.kind === "chain" && options.checkChainSelectors !== false) {
      for (const occupant of slot.occupants) {
        const instance = model.pluginInstances[occupant.instanceId];
        const definition = instance === undefined
          ? undefined
          : definitionById.get(instance.pluginId);
        if (definition !== undefined && definition.selectSlot === undefined) {
          issues.push({
            code: "chain-selector-missing",
            message: `UI plugin "${definition.manifest.id}" must define selectSlot when mounted in chain Slot "${slot.id}".`,
          });
        }
      }
    }
  }

  for (const instance of Object.values(model.pluginInstances)) {
    const definition = definitionById.get(instance.pluginId);
    for (const outlet of Object.keys(definition?.slots ?? {})) {
      if (!childSlotByOwnerOutlet.has(`${instance.id}\u0000${outlet}`)) {
        issues.push({
          code: "slot-configuration-missing",
          message: `PluginInstance "${instance.id}" is missing configured child Slot outlet "${outlet}".`,
        });
      }
    }
  }

  return issues;
}

const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be blank");

export const uiPluginSlotDefinitionSchema: z.ZodType<UIPluginSlotDefinition> =
  z.strictObject({
    kind: z.enum(["single", "list", "keyed", "chain"]),
    scope: z.enum(["root", "thread-maybe", "thread"]),
    description: nonBlankStringSchema,
    ownerProps: z
      .array(
        z.strictObject({
          name: nonBlankStringSchema,
          type: nonBlankStringSchema,
          description: nonBlankStringSchema,
          required: z.boolean(),
        }),
      )
      .optional(),
    fallback: z.enum(["none", "owner"]).optional(),
  });

export const uiPluginSlotDefinitionsSchema = z.record(
  z.string(),
  uiPluginSlotDefinitionSchema,
);

export function parseUIPluginSlotDefinitions(
  input: unknown,
): Record<string, UIPluginSlotDefinition> {
  return uiPluginSlotDefinitionsSchema.parse(input);
}

const manifestShapeSchema: z.ZodType<UIPluginManifest> = z.strictObject({
  id: nonBlankStringSchema,
  name: nonBlankStringSchema,
  description: nonBlankStringSchema,
  version: nonBlankStringSchema,
  capabilities: z.array(nonBlankStringSchema).optional(),
  data: z
    .strictObject({
      messages: z.boolean().optional(),
      state: z.boolean().optional(),
    })
    .optional(),
});

export const uiPluginManifestSchema = manifestShapeSchema.superRefine(
  (manifest, context) => {
    const capabilities = new Set<string>();
    manifest.capabilities?.forEach((capability, index) => {
      if (capabilities.has(capability)) {
        context.addIssue({
          code: "custom",
          path: ["capabilities", index],
          message: `Duplicate capability "${capability}"`,
          input: capability,
        });
      }
      capabilities.add(capability);
    });
  },
);

export const uiPluginInjectSchema = z
  .array(nonBlankStringSchema)
  .superRefine((names, context) => {
    const seen = new Set<string>();

    names.forEach((name, index) => {
      if (seen.has(name)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `Duplicate injected service "${name}"`,
          input: name,
        });
      }
      seen.add(name);
    });
  });

export function parseUIPluginManifest(input: unknown): UIPluginManifest {
  return uiPluginManifestSchema.parse(input);
}

export function parseUIPluginInject(input: unknown): string[] {
  return uiPluginInjectSchema.parse(input);
}
