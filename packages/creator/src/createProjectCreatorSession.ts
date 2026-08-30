import { randomUUID } from "node:crypto";

import { CreatorActivityRecorder } from "./CreatorActivityRecorder.js";
import {
  CreatorSession,
  type CreatorStreamInvoker,
} from "./CreatorSession.js";
import { createCreatorAgent } from "./createCreatorAgent.js";
import {
  createCreatorChatModel,
  loadCreatorModelConfig,
} from "./modelConfig.js";

export interface CreateProjectCreatorSessionOptions {
  projectRoot: string;
  configRoot?: string | undefined;
  environment?: NodeJS.ProcessEnv | undefined;
}

export function createProjectCreatorSession({
  projectRoot,
  configRoot = process.cwd(),
  environment,
}: CreateProjectCreatorSessionOptions): CreatorSession {
  const model = createCreatorChatModel(
    loadCreatorModelConfig({
      configRoot,
      ...(environment === undefined ? {} : { environment }),
    }),
  );
  const activity = new CreatorActivityRecorder(projectRoot);
  const agent = createCreatorAgent({ model, projectRoot, activity });

  const invoke = async (messages: Parameters<CreatorStreamInvoker>[0]) => {
    activity.begin();
    const result = await agent.invoke(
      {
        messages: messages.map(({ role, content }) => ({
          type: role,
          content,
        })),
      },
      { recursionLimit: 96 },
    );
    return {
      ...(result as { messages?: unknown[] | undefined }),
      receipt: await activity.finish(),
    };
  };

  const streamInvoke: CreatorStreamInvoker = async (
    messages,
    observer,
    options,
  ) => {
    activity.begin();
    const run = await agent.streamEvents(
      {
        messages: messages.map(({ role, content }) => ({
          type: role,
          content,
        })),
      },
      {
        version: "v3",
        recursionLimit: 96,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );

    for await (const message of run.messages) {
      const messageId = randomUUID();
      let started = false;
      for await (const delta of message.text) {
        if (delta === "") {
          continue;
        }
        if (!started) {
          started = true;
          observer.onTextMessageStart(messageId);
        }
        observer.onTextMessageContent(messageId, delta);
      }
      if (started) {
        observer.onTextMessageEnd(messageId);
      }
    }

    const result = await run.output;
    return {
      ...(result as { messages?: unknown[] | undefined }),
      receipt: await activity.finish(),
    };
  };

  return new CreatorSession(invoke, streamInvoke);
}
