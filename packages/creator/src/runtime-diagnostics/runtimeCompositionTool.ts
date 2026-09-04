import { tool } from "@langchain/core/tools";

import type { ProjectControlAdapter } from "../project-control/ProjectControlAdapter.js";
import { parseUIProjectInspection } from "../project-control/types.js";
import type {
  CreatorRuntimeCompositionInstance,
  CreatorRuntimeDiagnosticSession,
} from "./CreatorRuntimeDiagnosticStore.js";

export const DEFAULT_RUNTIME_COMPOSITION_WAIT_MS = 1_800;
export const MAX_RUNTIME_COMPOSITION_WAIT_MS = 3_000;
const MAX_TOOL_ERROR_MESSAGE_CHARACTERS = 1_000;
const MAX_TOOL_COMPONENT_STACK_CHARACTERS = 1_200;

export interface RuntimeCompositionExpectation {
  instanceId: string;
  mounted?: boolean | undefined;
  pluginId?: string | undefined;
  slotId?: string | undefined;
}

export type RuntimeCompositionCheckStatus =
  | "passed"
  | "missing"
  | "unexpectedly-mounted"
  | "plugin-mismatch"
  | "slot-mismatch"
  | "runtime-error"
  | "not-evaluated";

export interface RuntimeCompositionToolInput {
  expectedAppUIModelHash?: string | undefined;
  expect?: RuntimeCompositionExpectation[] | undefined;
  waitForSyncMs?: number | undefined;
}

function actualFor(
  instance: CreatorRuntimeCompositionInstance | undefined,
): CreatorRuntimeCompositionInstance & { mounted: true } | { mounted: false } {
  return instance === undefined
    ? { mounted: false }
    : { mounted: true, ...instance };
}

function truncate(
  value: string | undefined,
  maximum: number,
): string | undefined {
  if (value === undefined || value.length <= maximum) return value;
  return `${value.slice(0, maximum)}…`;
}

export function createRuntimeCompositionTool(
  adapter: ProjectControlAdapter,
  diagnostics: CreatorRuntimeDiagnosticSession,
) {
  return tool(
    async (input: RuntimeCompositionToolInput) => {
      try {
        const project = parseUIProjectInspection(
          await adapter.request("inspect_ui_project"),
        );
        const currentAppUIModelHash = project.appUIModel.hash;
        const expectedAppUIModelHash =
          input.expectedAppUIModelHash ?? currentAppUIModelHash;
        const expectedHashMatchesCurrent =
          expectedAppUIModelHash === currentAppUIModelHash;
        const waitForSyncMs = Math.min(
          MAX_RUNTIME_COMPOSITION_WAIT_MS,
          Math.max(0, input.waitForSyncMs ?? DEFAULT_RUNTIME_COMPOSITION_WAIT_MS),
        );
        const composition = expectedHashMatchesCurrent
          ? await diagnostics.waitForComposition(
              expectedAppUIModelHash,
              waitForSyncMs,
            )
          : diagnostics.inspectComposition(currentAppUIModelHash);
        const expectations = input.expect ?? [];
        const expectedInstanceIds = new Set(
          expectations.map((expectation) => expectation.instanceId),
        );
        const diagnosticInspection = diagnostics.inspect(
          currentAppUIModelHash,
        );
        const currentErrors = diagnosticInspection.currentErrors
          .filter((error) => expectedInstanceIds.has(error.instanceId))
          .map((error) => ({
            ...error,
            ...(error.errorMessage === undefined
              ? {}
              : {
                  errorMessage: truncate(
                    error.errorMessage,
                    MAX_TOOL_ERROR_MESSAGE_CHARACTERS,
                  ),
                }),
            ...(error.componentStack === undefined
              ? {}
              : {
                  componentStack: truncate(
                    error.componentStack,
                    MAX_TOOL_COMPONENT_STACK_CHARACTERS,
                  ),
                }),
          }));
        const errorsByInstance = new Set(
          currentErrors.map((error) => error.instanceId),
        );
        const instancesById = new Map(
          composition.instances.map((instance) => [
            instance.instanceId,
            instance,
          ]),
        );
        const canEvaluate =
          expectedHashMatchesCurrent && composition.synchronized;
        const checks = expectations.map((expectation) => {
          const expected = {
            mounted: expectation.mounted ?? true,
            ...(expectation.pluginId === undefined
              ? {}
              : { pluginId: expectation.pluginId }),
            ...(expectation.slotId === undefined
              ? {}
              : { slotId: expectation.slotId }),
          };
          const instance = instancesById.get(expectation.instanceId);
          const actual = actualFor(instance);
          let status: RuntimeCompositionCheckStatus = "passed";
          if (!canEvaluate) {
            status = "not-evaluated";
          } else if (errorsByInstance.has(expectation.instanceId)) {
            status = "runtime-error";
          } else if (expected.mounted && instance === undefined) {
            status = "missing";
          } else if (!expected.mounted && instance !== undefined) {
            status = "unexpectedly-mounted";
          } else if (
            instance !== undefined &&
            expectation.pluginId !== undefined &&
            instance.pluginId !== expectation.pluginId
          ) {
            status = "plugin-mismatch";
          } else if (
            instance !== undefined &&
            expectation.slotId !== undefined &&
            instance.slotId !== expectation.slotId
          ) {
            status = "slot-mismatch";
          }
          return {
            instanceId: expectation.instanceId,
            status,
            expected,
            actual,
          };
        });
        const verificationPerformed = checks.length > 0;
        return JSON.stringify({
          ok: true,
          result: {
            currentAppUIModelHash,
            expectedAppUIModelHash,
            expectedHashMatchesCurrent,
            ...(composition.runtimeAppUIModelHash === undefined
              ? {}
              : {
                  runtimeAppUIModelHash: composition.runtimeAppUIModelHash,
                }),
            runtimeStatus: composition.runtimeStatus,
            synchronized: composition.synchronized,
            ...(composition.observedAt === undefined
              ? {}
              : { observedAt: composition.observedAt }),
            instances: composition.instances,
            checks,
            currentErrors,
            verificationPerformed,
            verificationPassed:
              canEvaluate &&
              verificationPerformed &&
              checks.every((check) => check.status === "passed"),
          },
        });
      } catch (error) {
        return JSON.stringify({
          ok: false,
          error: {
            code: "RUNTIME_COMPOSITION_INSPECTION_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },
    {
      name: "inspect_runtime_composition",
      description:
        "Verify that the Preview Runtime loaded the current AppUIModel hash and that expected PluginInstances actually committed in their runtime Slots. This is runtime evidence and does not replace verify:ui or typecheck.",
      schema: {
        type: "object",
        properties: {
          expectedAppUIModelHash: {
            type: "string",
            pattern: "^[a-f0-9]{64}$",
            description:
              "The result.appUIModel.afterHash returned by the semantic mutation.",
          },
          expect: {
            type: "array",
            maxItems: 100,
            items: {
              type: "object",
              properties: {
                instanceId: { type: "string", minLength: 1, maxLength: 200 },
                mounted: {
                  type: "boolean",
                  description: "Defaults to true.",
                },
                pluginId: { type: "string", minLength: 1, maxLength: 200 },
                slotId: { type: "string", minLength: 1, maxLength: 200 },
              },
              required: ["instanceId"],
              additionalProperties: false,
            },
          },
          waitForSyncMs: {
            type: "number",
            minimum: 0,
            maximum: MAX_RUNTIME_COMPOSITION_WAIT_MS,
            description: `Wait up to ${MAX_RUNTIME_COMPOSITION_WAIT_MS}ms for Preview HMR synchronization.`,
          },
        },
        additionalProperties: false,
      },
    },
  );
}
