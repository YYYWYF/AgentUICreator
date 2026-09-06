import { z } from "zod";

/**
 * The generated application defines its backend event contract here.
 * Plugin manifests only declare which registered events they consume.
 */
export const appEventSchemas = {} as const satisfies Record<
  string,
  z.ZodTypeAny
>;

export type AppEventName = keyof typeof appEventSchemas & string;

export type AppEventPayload<TName extends AppEventName> = z.infer<
  (typeof appEventSchemas)[TName]
>;
