import { z } from "zod";
import type {
  AgentFrontendToolCall,
  AgentFrontendToolDefinition,
  AgentFrontendToolExecuteOptions,
  AgentFrontendToolResult,
  AgentFrontendToolSource,
} from "@agent-ui/runtime-core";

import type { UIPluginServices } from "../../framework/contracts/ui-plugin";
import { AppFrontendToolRegistry } from "./AppFrontendToolRegistry";

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length === 0 ? "input" : issue.path.join(".");
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function serializeResult(value: unknown): string {
  if (typeof value === "string") return value;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Frontend tool returned a non-serializable result");
  }
  return serialized;
}

export class AppFrontendToolRuntime implements AgentFrontendToolSource {
  readonly #registry: AppFrontendToolRegistry;
  #connection: { services: UIPluginServices } | undefined;

  constructor(registry: AppFrontendToolRegistry) {
    this.#registry = registry;
  }

  connectServices(services: UIPluginServices): () => void {
    const connection = { services };
    this.#connection = connection;
    let connected = true;
    return () => {
      if (connected && this.#connection === connection) {
        this.#connection = undefined;
      }
      connected = false;
    };
  }

  listTools(): readonly AgentFrontendToolDefinition[] {
    const services = this.#connection?.services;
    if (services === undefined) return [];

    return this.#registry.list().flatMap((definition) => {
      if (!this.#hasRequiredServices(definition.requires, services)) {
        return [];
      }
      return [{
        name: definition.name,
        description: definition.description,
        inputSchema: structuredClone(
          z.toJSONSchema(definition.inputSchema),
        ) as Record<string, unknown>,
      }];
    });
  }

  async execute(
    call: AgentFrontendToolCall,
    options: AgentFrontendToolExecuteOptions,
  ): Promise<AgentFrontendToolResult> {
    const definition = this.#registry.get(call.name);
    const services = this.#connection?.services;

    if (
      definition === undefined ||
      services === undefined ||
      !this.#hasRequiredServices(definition.requires, services)
    ) {
      const error = `Frontend capability unavailable for tool "${call.name}"`;
      return {
        content: `Frontend tool execution failed: ${error}`,
        error,
      };
    }

    const parsed = definition.inputSchema.safeParse(call.input);
    if (!parsed.success) {
      return {
        content: "Invalid frontend tool arguments",
        error: `Invalid frontend tool arguments: ${formatZodIssues(parsed.error)}`,
      };
    }

    try {
      if (options.signal.aborted) {
        throw new DOMException("Frontend tool execution aborted", "AbortError");
      }
      const result = await definition.execute(
        { services, signal: options.signal },
        parsed.data,
      );
      return { content: serializeResult(result) };
    } catch (error) {
      const message = formatError(error);
      return {
        content: `Frontend tool execution failed: ${message}`,
        error: message,
      };
    }
  }

  #hasRequiredServices(
    requiredServices: readonly string[],
    services: UIPluginServices,
  ): boolean {
    return requiredServices.every(
      (serviceName) => services.get(serviceName) !== undefined,
    );
  }
}
