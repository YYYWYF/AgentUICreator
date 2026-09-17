import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  buildLayoutRefIndex,
  collectAppUIPluginLocations,
  parseAppUIModelJson,
  type AppUIPluginLocation,
} from "../../framework/contracts/app-ui-model";
import {
  AppUICompilerError,
  compileAppUIModel,
} from "../../framework/contracts/app-ui-compiler";
import { generatePluginRegistry } from "./registry-generator";
import { COMPOSITION_REVISION_PATH } from "./app-ui-transaction";

const appUIModelHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const runtimeIdentifierSchema = z.string().trim().min(1).max(200);
const runtimePathSchema = z.string().trim().min(1).max(1_000);
const runtimeRectSchema = z.strictObject({
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
  width: z.number().finite().min(0).max(1_000_000),
  height: z.number().finite().min(0).max(1_000_000),
});
const runtimeViewportSchema = z.strictObject({
  width: z.number().finite().min(0).max(1_000_000),
  height: z.number().finite().min(0).max(1_000_000),
});

const runtimeCompositionApplicationSchema = z.strictObject({
  phase: z.enum([
    "bootstrapping",
    "resolving-gates",
    "blocked",
    "ready",
    "error",
  ]),
  activeGateInstanceId: runtimeIdentifierSchema.optional(),
});

const runtimeCompositionInstanceSchema = z.strictObject({
  instanceId: runtimeIdentifierSchema,
  pluginId: runtimeIdentifierSchema,
  slotId: runtimeIdentifierSchema,
  slotPath: runtimePathSchema.optional(),
  rect: runtimeRectSchema.optional(),
});

const runtimeCompositionSlotSchema = z.strictObject({
  slotId: runtimeIdentifierSchema,
  widthClass: z.enum(["unknown", "narrow", "wide"]),
  slotPath: runtimePathSchema.optional(),
  rect: runtimeRectSchema.optional(),
});

const runtimeLayoutNodeSchema = z.strictObject({
  nodeId: runtimeIdentifierSchema,
  type: z.enum(["row", "column", "panel", "stack", "slot"]),
  rect: runtimeRectSchema,
});

export const runtimeCompositionSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  appUIModelHash: appUIModelHashSchema,
  compositionRevision: runtimeIdentifierSchema,
  capabilityCatalogRevision: appUIModelHashSchema,
  publishedAt: z.iso.datetime({ offset: true }),
  observedAt: z.iso.datetime({ offset: true }),
  application: runtimeCompositionApplicationSchema.optional(),
  instances: z.array(runtimeCompositionInstanceSchema).max(500),
  slots: z.array(runtimeCompositionSlotSchema).max(500),
  viewport: runtimeViewportSchema.optional(),
  layoutNodes: z.array(runtimeLayoutNodeSchema).max(200).optional(),
});

export const verifyRuntimeCompositionInputSchema = z.strictObject({
  appUIModelHash: appUIModelHashSchema,
  composition: runtimeCompositionSnapshotSchema,
});

export type VerifyRuntimeCompositionInput = z.infer<
  typeof verifyRuntimeCompositionInputSchema
>;

export interface RuntimeCompositionVerificationResult {
  verified: boolean;
  checks: Array<{
    instanceId: string;
    status: "passed" | "missing" | "plugin-mismatch" | "slot-mismatch";
    expected: {
      pluginId: string;
      target:
        | { type: "application" }
        | { type: "layout_slot"; slotRef: string }
        | { type: "plugin_slot"; parentInstanceId: string; slot: string };
    };
    actual: { mounted: boolean; pluginId?: string };
  }>;
}

export class RuntimeCompositionVerificationError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "RuntimeCompositionVerificationError";
    this.code = code;
    this.details = details;
  }
}

function authoringTarget(
  location: AppUIPluginLocation,
  layoutRefs: ReturnType<typeof buildLayoutRefIndex>,
): RuntimeCompositionVerificationResult["checks"][number]["expected"]["target"] {
  if (location.target.type === "application") {
    return { type: "application" };
  }
  if (location.target.type === "plugin_slot") {
    return {
      type: "plugin_slot",
      parentInstanceId: location.target.parentInstanceId,
      slot: location.target.slot,
    };
  }
  const slotRef = layoutRefs.byPath.get(location.target.slotPath);
  if (slotRef === undefined) {
    throw new RuntimeCompositionVerificationError(
      "RUNTIME_COMPOSITION_VERIFICATION_FAILED",
      "The current AppUIModel contains a Layout Slot without a snapshot reference.",
    );
  }
  return { type: "layout_slot", slotRef };
}

function compileFailureDetails(error: AppUICompilerError): object {
  return {
    issues: error.issues.map(({ code, instanceId, pluginId, slot }) => ({
      code,
      instanceId,
      pluginId,
      ...(slot === undefined ? {} : { slot }),
    })),
  };
}

export async function verifyRuntimeComposition(
  projectRoot: string,
  rawInput: unknown,
): Promise<RuntimeCompositionVerificationResult> {
  const input = verifyRuntimeCompositionInputSchema.parse(rawInput);
  const appUIModelSource = await readFile(
    `${projectRoot}/app-ui/app-ui.json`,
    "utf8",
  );
  const currentHash = createHash("sha256")
    .update(appUIModelSource)
    .digest("hex");
  if (currentHash !== input.appUIModelHash) {
    throw new RuntimeCompositionVerificationError(
      "APP_UI_MODEL_HASH_CONFLICT",
      "AppUIModel changed before Runtime composition verification; inspect the project again and retry.",
      { expectedHash: input.appUIModelHash, actualHash: currentHash },
    );
  }
  if (input.composition.appUIModelHash !== input.appUIModelHash) {
    throw new RuntimeCompositionVerificationError(
      "RUNTIME_COMPOSITION_HASH_CONFLICT",
      "Runtime composition evidence belongs to a different AppUIModel hash.",
      {
        expectedHash: input.appUIModelHash,
        actualHash: input.composition.appUIModelHash,
      },
    );
  }

  const model = parseAppUIModelJson(appUIModelSource);
  const registry = await generatePluginRegistry(projectRoot, model);
  if (registry.errors.length > 0) {
    throw new RuntimeCompositionVerificationError(
      "RUNTIME_COMPOSITION_VERIFICATION_FAILED",
      "The current AppUIModel cannot be compiled for Runtime composition verification.",
      { issues: registry.errors.map(({ code, message }) => ({ code, message })) },
    );
  }
  if (
    input.composition.capabilityCatalogRevision !==
    registry.capabilityCatalog.revision
  ) {
    throw new RuntimeCompositionVerificationError(
      "RUNTIME_COMPOSITION_REVISION_CONFLICT",
      "Runtime composition evidence belongs to a different capability catalog revision.",
      {
        expectedRevision: registry.capabilityCatalog.revision,
        actualRevision: input.composition.capabilityCatalogRevision,
      },
    );
  }
  try {
    const descriptor = JSON.parse(await readFile(
      path.join(projectRoot, COMPOSITION_REVISION_PATH),
      "utf8",
    )) as Record<string, unknown>;
    if (
      descriptor.appUIModelHash === currentHash &&
      descriptor.capabilityCatalogRevision ===
        registry.capabilityCatalog.revision &&
      input.composition.compositionRevision !== descriptor.transactionId
    ) {
      throw new RuntimeCompositionVerificationError(
        "RUNTIME_COMPOSITION_REVISION_CONFLICT",
        "Runtime composition evidence predates the current ProjectControl transaction.",
        {
          expectedRevision: descriptor.transactionId,
          actualRevision: input.composition.compositionRevision,
        },
      );
    }
  } catch (error) {
    if (
      error instanceof RuntimeCompositionVerificationError ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw error;
    }
  }

  let runtimeModel;
  try {
    runtimeModel = compileAppUIModel(
      model,
      registry.activeComposition.compositionCatalog,
    );
  } catch (error) {
    if (error instanceof AppUICompilerError) {
      throw new RuntimeCompositionVerificationError(
        "RUNTIME_COMPOSITION_VERIFICATION_FAILED",
        "The current AppUIModel cannot be compiled for Runtime composition verification.",
        compileFailureDetails(error),
      );
    }
    throw error;
  }

  const layoutRefs = buildLayoutRefIndex(model.root);
  const actualById = new Map(
    input.composition.instances.map((instance) => [instance.instanceId, instance]),
  );
  const checks: RuntimeCompositionVerificationResult["checks"] = [];

  for (const location of collectAppUIPluginLocations(model)) {
    if (!location.plugin.enabled || location.target.type === "application") {
      continue;
    }
    const expectedRuntimeInstance = runtimeModel.pluginInstances[location.plugin.id];
    const expectedTarget = authoringTarget(location, layoutRefs);
    const actual = actualById.get(location.plugin.id);
    let status: "passed" | "missing" | "plugin-mismatch" | "slot-mismatch" =
      "passed";
    if (actual === undefined) {
      status = "missing";
    } else if (actual.pluginId !== location.plugin.pluginId) {
      status = "plugin-mismatch";
    } else if (
      expectedRuntimeInstance?.mount?.slotId === undefined ||
      actual.slotId !== expectedRuntimeInstance.mount.slotId
    ) {
      status = "slot-mismatch";
    }
    checks.push({
      instanceId: location.plugin.id,
      status,
      expected: {
        pluginId: location.plugin.pluginId,
        target: expectedTarget,
      },
      actual:
        actual === undefined
          ? { mounted: false }
          : { mounted: true, pluginId: actual.pluginId },
    });
  }

  const applicationPhase = input.composition.application?.phase;
  const workspaceCompositionRequired =
    applicationPhase === undefined || applicationPhase === "ready";
  return {
    verified:
      applicationPhase !== "error" &&
      (!workspaceCompositionRequired ||
        checks.every((check) => check.status === "passed")),
    checks,
  };
}
