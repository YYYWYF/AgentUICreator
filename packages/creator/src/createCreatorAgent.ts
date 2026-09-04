import {
  CompositeBackend,
  createDeepAgent,
  createSummarizationMiddleware,
  StateBackend,
  type CreateDeepAgentParams,
  type FilesystemPermission,
} from "deepagents";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CreatorActivityRecorder } from "./CreatorActivityRecorder.js";
import {
  CreatorCompletionGate,
  createCreatorCompletionGateMiddleware,
} from "./CreatorCompletionGate.js";
import {
  CreatorSkillsBackend,
  ProjectCommandBackend,
  ProjectCreatorBackend,
} from "./ProjectCreatorBackend.js";
import {
  createCreatorRunLoggerMiddleware,
  type CreatorRunLogger,
} from "./CreatorRunLogger.js";
import { CREATOR_SYSTEM_PROMPT } from "./prompt/system.js";
import { ProjectControlAdapter } from "./project-control/ProjectControlAdapter.js";
import { createCreatorProjectControlMiddleware } from "./project-control/creatorProjectTools.js";
import { ensureCreatorToolCallIds } from "./toolCallIds.js";
import type { CreatorRuntimeDiagnosticSession } from "./runtime-diagnostics/CreatorRuntimeDiagnosticStore.js";
import { CreatorValidationService } from "./validation/CreatorValidationService.js";

export const CREATOR_SKILLS_SOURCE = "/skills/";
export const CREATOR_SUMMARIZATION_TRIGGER_TOKENS = 12_000;
export const CREATOR_SUMMARIZATION_TRIGGER_MESSAGES = 24;
export const CREATOR_SUMMARIZATION_KEEP_MESSAGES = 8;
export const CREATOR_SKILLS_ROOT = path.resolve(
  fileURLToPath(new URL("../skills/", import.meta.url)),
);

export const CREATOR_FILESYSTEM_PERMISSIONS: FilesystemPermission[] = [
  {
    operations: ["read"],
    paths: ["/skills/**"],
  },
  {
    operations: ["write"],
    paths: ["/skills/**"],
    mode: "deny",
  },
  {
    operations: ["read"],
    paths: ["/project/**"],
  },
  {
    operations: ["write"],
    paths: ["/project/app-ui/app-ui.json"],
  },
  {
    operations: ["write"],
    paths: [
      "/project/plugins/index.ts",
      "/project/plugins/registry.generated.ts",
    ],
    mode: "deny",
  },
  {
    operations: ["write"],
    paths: ["/project/plugins/**"],
  },
  {
    operations: ["write"],
    paths: ["/project/**"],
    mode: "deny",
  },
];

export interface CreateCreatorAgentOptions {
  model: NonNullable<CreateDeepAgentParams["model"]>;
  projectRoot: string;
  activity?: CreatorActivityRecorder | undefined;
  completionGate?: boolean | undefined;
  runLogger?: CreatorRunLogger | undefined;
  runtimeDiagnostics?: CreatorRuntimeDiagnosticSession | undefined;
  validationService?: Pick<
    CreatorValidationService,
    "ensureCurrentRevisionValidated"
  > | undefined;
}

export type CreatorAgent = ReturnType<typeof createDeepAgent>;

type CreatorMiddleware = NonNullable<
  CreateDeepAgentParams["middleware"]
>[number];

const creatorSummarizationEvents = new WeakMap<object, unknown>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function clearCreatorSummarizationEvent(agent: CreatorAgent): void {
  creatorSummarizationEvents.delete(agent);
}

export function takeCreatorSummarizationEvent(
  agent: CreatorAgent,
): unknown {
  const event = creatorSummarizationEvents.get(agent);
  creatorSummarizationEvents.delete(agent);
  return event;
}

const creatorToolCallIdMiddleware: CreatorMiddleware = {
  name: "creator-tool-call-id-normalizer",
  async wrapModelCall(request, handler) {
    return ensureCreatorToolCallIds(await handler(request));
  },
};

export function createCreatorAgent({
  model,
  projectRoot,
  activity,
  completionGate = activity !== undefined,
  runLogger,
  runtimeDiagnostics,
  validationService,
}: CreateCreatorAgentOptions): CreatorAgent {
  const conversationHistoryBackend = new StateBackend();
  const backend = new CompositeBackend(
    new ProjectCommandBackend({ projectRoot, activity }),
    {
      "/conversation_history/": conversationHistoryBackend,
      "/project/": new ProjectCreatorBackend({ projectRoot, activity }),
      "/skills/": new CreatorSkillsBackend({
        skillsRoot: CREATOR_SKILLS_ROOT,
      }),
    },
  );

  let agentReference: CreatorAgent | undefined;
  const summarizationMiddleware = createSummarizationMiddleware({
    backend,
    trigger: [
      { type: "tokens", value: CREATOR_SUMMARIZATION_TRIGGER_TOKENS },
      { type: "messages", value: CREATOR_SUMMARIZATION_TRIGGER_MESSAGES },
    ],
    keep: {
      type: "messages",
      value: CREATOR_SUMMARIZATION_KEEP_MESSAGES,
    },
    truncateArgsSettings: {
      trigger: {
        type: "messages",
        value: CREATOR_SUMMARIZATION_KEEP_MESSAGES * 2,
      },
      keep: {
        type: "messages",
        value: CREATOR_SUMMARIZATION_KEEP_MESSAGES,
      },
    },
  });
  const wrapSummarizationModelCall = summarizationMiddleware.wrapModelCall;
  if (wrapSummarizationModelCall === undefined) {
    throw new Error("DeepAgents summarization middleware is unavailable.");
  }
  const observedSummarizationMiddleware: CreatorMiddleware = {
    ...summarizationMiddleware,
    async wrapModelCall(request, handler) {
      const result = await wrapSummarizationModelCall(request, handler);
      if (
        agentReference !== undefined &&
        isRecord(result) &&
        isRecord(result.update) &&
        result.update._summarizationEvent !== undefined
      ) {
        creatorSummarizationEvents.set(
          agentReference,
          result.update._summarizationEvent,
        );
      }
      return result;
    },
  };
  const middleware: CreatorMiddleware[] = [
    creatorToolCallIdMiddleware,
    observedSummarizationMiddleware,
    createCreatorProjectControlMiddleware(
      new ProjectControlAdapter({ projectRoot }),
      activity,
      runtimeDiagnostics,
    ),
  ];
  if (completionGate) {
    if (activity === undefined) {
      throw new Error(
        "Creator completion gate requires a CreatorActivityRecorder.",
      );
    }
    middleware.push(
      createCreatorCompletionGateMiddleware(
        new CreatorCompletionGate({
          activity,
          validationService:
            validationService ??
            new CreatorValidationService({
              projectRoot,
              activity,
              runLogger,
            }),
        }),
      ),
    );
  }
  if (runLogger !== undefined) {
    middleware.push(createCreatorRunLoggerMiddleware(runLogger, activity));
  }

  const agent = createDeepAgent({
    backend,
    middleware,
    model,
    name: "agent-ui-creator",
    permissions: CREATOR_FILESYSTEM_PERMISSIONS,
    skills: [CREATOR_SKILLS_SOURCE],
    systemPrompt: CREATOR_SYSTEM_PROMPT,
  });
  agentReference = agent;
  return agent;
}
