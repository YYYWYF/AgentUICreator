import type { AgentApplicationEvent } from "@agent-ui/runtime-core";
import { z } from "zod";

import type { UIPluginEvents } from "../framework/contracts/ui-plugin";

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

export function subscribeAppEvent<TName extends AppEventName>(
  events: UIPluginEvents,
  name: TName,
  listener: (
    event: AgentApplicationEvent<AppEventPayload<TName>>,
  ) => void | Promise<void>,
): () => void {
  return events.subscribe<AppEventPayload<TName>>(name, listener);
}
