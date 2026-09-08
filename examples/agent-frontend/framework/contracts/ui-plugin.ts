import type {
  AgentApplicationEvent,
  AgentInterruptResponse,
  AgentUserInput,
} from "@agent-ui/runtime-core";
import type { ComponentType, ReactNode } from "react";
import { z } from "zod";

import type { PluginInstance } from "./app-ui-model";
import { customEventNameSchema } from "./custom-event-protocol";

export type {
  AgentApplicationEvent,
  AgentConversation,
  AgentExecution,
  AgentInterrupt,
  AgentInterruptResponse,
  AgentInterruptResponseStatus,
  AgentMessage,
  AgentRunState,
  AgentToolCall,
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
        /** Declares consumption; schemas are registered by agent-contract. */
        events?: readonly string[] | undefined;
      }
    | undefined;
}

export interface UIPluginActions {
  sendMessage(input: string | AgentUserInput): Promise<void>;
  resumeInterrupts(responses: AgentInterruptResponse[]): Promise<void>;
  startNewConversation(): Promise<void>;
  abortRun(): void;
  updateInstanceProps(props: Record<string, unknown>): void;
}

export interface UIPluginObservableService<TSnapshot> {
  getSnapshot(): TSnapshot;
  subscribe(listener: () => void): () => void;
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

export interface UIPluginEvents {
  subscribe<TPayload = unknown>(
    name: string,
    listener: (
      event: AgentApplicationEvent<TPayload>,
    ) => void | Promise<void>,
  ): () => void;
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
  events: UIPluginEvents;
  services: UIPluginServiceRegistrar;
}

export type UIPluginSetupCleanup = void | (() => void);

export interface UIPluginComponentProps {
  renderSlot(slotId: string, fallback?: ReactNode): ReactNode;
}

export interface UIPluginDefinition<TState = unknown> {
  manifest: UIPluginManifest;
  /** Named capabilities provided by this plugin instance. */
  provides?: readonly string[] | undefined;
  /** Named services that must exist before this plugin instance becomes active. */
  inject?: readonly string[] | undefined;
  /** Named enhancement services that never gate plugin activation. */
  optionalInject?: readonly string[] | undefined;
  /** Instance-lifetime setup. Services provided here are removed on deactivation. */
  setup?:
    | ((context: UIPluginSetupContext) => UIPluginSetupCleanup)
    | undefined;
  Component: ComponentType<UIPluginComponentProps>;
}

const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be blank");

const serviceNameSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be blank")
  .refine(
    (value) =>
      /^(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*)$/.test(
        value,
      ),
    "Must be lowercase dot-separated (for example: editor, workspace.files)",
  );

const serviceNameListSchema = z.array(serviceNameSchema).superRefine((names, context) => {
  const seen = new Set<string>();

  names.forEach((name, index) => {
    if (seen.has(name)) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: `Duplicate service name "${name}"`,
        input: name,
      });
    }
    seen.add(name);
  });
});

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
      events: z.array(customEventNameSchema).optional(),
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

    const applicationEvents = new Set<string>();
    manifest.data?.events?.forEach((eventName, index) => {
      if (applicationEvents.has(eventName)) {
        context.addIssue({
          code: "custom",
          path: ["data", "events", index],
          message: `Duplicate application event declaration "${eventName}"`,
          input: eventName,
        });
      }
      applicationEvents.add(eventName);
    });
  },
);

export const uiPluginInjectSchema = serviceNameListSchema;

export const uiPluginProvidesSchema = serviceNameListSchema;

export const uiPluginOptionalInjectSchema = serviceNameListSchema;

export function parseUIPluginManifest(input: unknown): UIPluginManifest {
  return uiPluginManifestSchema.parse(input);
}

export function parseUIPluginInject(input: unknown): string[] {
  return serviceNameListSchema.parse(input);
}

export function parseUIPluginProvides(input: unknown): string[] {
  return serviceNameListSchema.parse(input);
}

export function parseUIPluginOptionalInject(input: unknown): string[] {
  return serviceNameListSchema.parse(input);
}
