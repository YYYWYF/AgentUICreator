import type {
  AgentConversation,
  AgentExecution,
  AgentMessage,
  AgentRunState,
  AgentUserInput,
} from "@agent-ui/runtime-core";
import type { ComponentType, ReactNode } from "react";
import { z } from "zod";

import type { PluginInstance } from "./app-ui-model";

export type {
  AgentConversation,
  AgentExecution,
  AgentMessage,
  AgentRunState,
  AgentUserInput,
} from "@agent-ui/runtime-core";

export interface UIPluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities?: string[] | undefined;
  slots?:
    | {
        children?: readonly string[] | undefined;
      }
    | undefined;
  data?:
    | {
        messages?: boolean | undefined;
        state?: boolean | undefined;
      }
    | undefined;
}

export interface UIPluginActions {
  sendMessage(input: string | AgentUserInput): Promise<void>;
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

export interface UIPluginContext<TState = unknown> {
  conversation: AgentConversation;
  messages: AgentMessage[];
  state: TState;
  run: AgentRunState;
  executions: AgentExecution[];
  instance: PluginInstance;
  actions: UIPluginActions;
  services: UIPluginServices;
}

export interface UIPluginComponentProps<TState = unknown> {
  context: UIPluginContext<TState>;
  renderSlot(slotId: string): ReactNode;
}

export interface UIPluginDefinition<TState = unknown> {
  manifest: UIPluginManifest;
  /** Named services that must exist before this plugin instance becomes active. */
  inject?: readonly string[] | undefined;
  /** Instance-lifetime setup. Services provided here are removed on deactivation. */
  setup?:
    | ((context: UIPluginSetupContext) => UIPluginSetupCleanup)
    | undefined;
  Component: ComponentType<UIPluginComponentProps<TState>>;
}

const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be blank");

const manifestShapeSchema: z.ZodType<UIPluginManifest> = z.strictObject({
  id: nonBlankStringSchema,
  name: nonBlankStringSchema,
  description: nonBlankStringSchema,
  version: nonBlankStringSchema,
  capabilities: z.array(nonBlankStringSchema).optional(),
  slots: z
    .strictObject({
      children: z.array(nonBlankStringSchema).optional(),
    })
    .optional(),
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

    const childSlots = new Set<string>();
    manifest.slots?.children?.forEach((slotId, index) => {
      if (childSlots.has(slotId)) {
        context.addIssue({
          code: "custom",
          path: ["slots", "children", index],
          message: `Duplicate child Slot "${slotId}"`,
          input: slotId,
        });
      }
      childSlots.add(slotId);
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
