import {
  CompositeBackend,
  createDeepAgent,
  type CreateDeepAgentParams,
  type FilesystemPermission,
} from "deepagents";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CreatorActivityRecorder } from "./CreatorActivityRecorder.js";
import {
  CreatorSkillsBackend,
  ProjectCommandBackend,
  ProjectCreatorBackend,
} from "./ProjectCreatorBackend.js";
import { CREATOR_SYSTEM_PROMPT } from "./prompt/system.js";
import { ensureCreatorToolCallIds } from "./toolCallIds.js";

export const CREATOR_SKILLS_SOURCE = "/skills/";
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
}

export type CreatorAgent = ReturnType<typeof createDeepAgent>;

type CreatorMiddleware = NonNullable<
  CreateDeepAgentParams["middleware"]
>[number];

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
}: CreateCreatorAgentOptions): CreatorAgent {
  const backend = new CompositeBackend(
    new ProjectCommandBackend({ projectRoot, activity }),
    {
      "/project/": new ProjectCreatorBackend({ projectRoot, activity }),
      "/skills/": new CreatorSkillsBackend({
        skillsRoot: CREATOR_SKILLS_ROOT,
      }),
    },
  );

  return createDeepAgent({
    backend,
    middleware: [creatorToolCallIdMiddleware],
    model,
    name: "agent-ui-creator",
    permissions: CREATOR_FILESYSTEM_PERMISSIONS,
    skills: [CREATOR_SKILLS_SOURCE],
    systemPrompt: CREATOR_SYSTEM_PROMPT,
  });
}
