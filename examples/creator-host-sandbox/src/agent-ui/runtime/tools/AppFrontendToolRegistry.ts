import { z } from "zod";

import type { UIPluginServices } from "../../framework/contracts/ui-plugin";

const frontendToolNamePattern = /^[a-z][a-z0-9_]{0,63}$/;

export interface AppFrontendToolExecutionContext {
  services: UIPluginServices;
  signal: AbortSignal;
}

export interface AppFrontendToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  requires: readonly string[];
  execute(
    context: AppFrontendToolExecutionContext,
    input: TInput,
  ): unknown | Promise<unknown>;
}

export function defineFrontendTool<TInput>(
  definition: AppFrontendToolDefinition<TInput>,
): AppFrontendToolDefinition<TInput> {
  return definition;
}

export class AppFrontendToolRegistry {
  readonly #definitions = new Map<string, AppFrontendToolDefinition<unknown>>();

  constructor(definitions: readonly AppFrontendToolDefinition<unknown>[]) {
    for (const definition of definitions) {
      this.#register(definition);
    }
  }

  list(): readonly AppFrontendToolDefinition<unknown>[] {
    return [...this.#definitions.values()];
  }

  get(name: string): AppFrontendToolDefinition<unknown> | undefined {
    return this.#definitions.get(name);
  }

  #register(definition: AppFrontendToolDefinition<unknown>): void {
    if (!frontendToolNamePattern.test(definition.name)) {
      throw new Error(
        `Frontend tool name "${definition.name}" must use lower_snake_case and contain at most 64 characters`,
      );
    }
    if (definition.description.trim().length === 0) {
      throw new Error(
        `Frontend tool "${definition.name}" must have a non-blank description`,
      );
    }
    if (this.#definitions.has(definition.name)) {
      throw new Error(`Duplicate frontend tool name "${definition.name}"`);
    }

    const requires = new Set<string>();
    for (const serviceName of definition.requires) {
      if (requires.has(serviceName)) {
        throw new Error(
          `Frontend tool "${definition.name}" has duplicate required service "${serviceName}"`,
        );
      }
      requires.add(serviceName);
    }

    this.#definitions.set(definition.name, definition);
  }
}
