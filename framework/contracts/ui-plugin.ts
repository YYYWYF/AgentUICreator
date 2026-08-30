import type { Message } from "@ag-ui/core";
import type { ComponentType } from "react";
import { z } from "zod";

import type { PluginInstance } from "./app-ui-model";

export type AGUIMessage = Message;

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
  updateInstanceProps(props: Record<string, unknown>): void;
}

export interface UIPluginContext {
  messages: AGUIMessage[];
  state: unknown;
  instance: PluginInstance;
  actions: UIPluginActions;
}

export interface UIPluginComponentProps {
  context: UIPluginContext;
}

export interface UIPluginDefinition {
  manifest: UIPluginManifest;
  Component: ComponentType<UIPluginComponentProps>;
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

export function parseUIPluginManifest(input: unknown): UIPluginManifest {
  return uiPluginManifestSchema.parse(input);
}
