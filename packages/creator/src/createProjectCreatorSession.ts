import { randomUUID } from "node:crypto";

import { CreatorActivityRecorder } from "./CreatorActivityRecorder.js";
import {
  CreatorSession,
  finalCreatorMessage,
  type CreatorStreamInvoker,
} from "./CreatorSession.js";
import { createCreatorAgent } from "./createCreatorAgent.js";
import {
  CreatorRunLogger,
  withCreatorDiagnosticLog,
} from "./CreatorRunLogger.js";
import {
  createCreatorChatModel,
  loadCreatorModelConfig,
} from "./modelConfig.js";
import type { CreatorRuntimeDiagnosticSession } from "./runtime-diagnostics/CreatorRuntimeDiagnosticStore.js";

export interface CreateProjectCreatorSessionOptions {
  projectRoot: string;
  configRoot?: string | undefined;
  environment?: NodeJS.ProcessEnv | undefined;
  runtimeDiagnostics?: CreatorRuntimeDiagnosticSession | undefined;
}

export function createProjectCreatorSession({
  projectRoot,
  configRoot = process.cwd(),
  environment,
  runtimeDiagnostics,
}: CreateProjectCreatorSessionOptions): CreatorSession {
  const config = loadCreatorModelConfig({
    configRoot,
    ...(environment === undefined ? {} : { environment }),
  });
  const model = createCreatorChatModel(config);
  const activity = new CreatorActivityRecorder(projectRoot);
  const runLogger = new CreatorRunLogger({
    projectRoot,
    modelName: config.modelName,
  });
  const agent = createCreatorAgent({
    model,
    projectRoot,
    activity,
    runLogger,
    runtimeDiagnostics,
  });

  const invoke = async (messages: Parameters<CreatorStreamInvoker>[0]) => {
    const runId = randomUUID();
    activity.begin(runId);
    await runLogger.begin({
      source: "session",
      runId,
      messages,
    });
    try {
      const result = await agent.invoke(
        {
          messages: messages.map(({ role, content }) => ({
            type: role,
            content,
          })),
        },
        { recursionLimit: 96 },
      );
      const finalMessage = finalCreatorMessage(result);
      const receipt = withCreatorDiagnosticLog(
        await activity.finish(),
        runLogger,
      );
      await runLogger.finish("success", { finalMessage, receipt });
      return {
        ...(result as { messages?: unknown[] | undefined }),
        receipt,
      };
    } catch (error) {
      let receipt;
      try {
        receipt = withCreatorDiagnosticLog(await activity.finish(), runLogger);
      } catch (transactionError) {
        await runLogger.record("transaction_persist_error", {
          error: transactionError,
        });
      }
      await runLogger.finish("error", { error, receipt });
      throw error;
    }
  };

  const streamInvoke: CreatorStreamInvoker = async (
    messages,
    observer,
    options,
  ) => {
    const runId = randomUUID();
    activity.begin(runId);
    await runLogger.begin({
      source: "session",
      runId,
      messages,
    });
    try {
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
        for await (const delta of message.text) {
          void delta;
        }
      }

      const result = await run.output;
      const finalText = finalCreatorMessage(result);
      const messageId = randomUUID();
      observer.onTextMessageStart(messageId);
      observer.onTextMessageContent(messageId, finalText);
      observer.onTextMessageEnd(messageId);
      const receipt = withCreatorDiagnosticLog(
        await activity.finish(),
        runLogger,
      );
      await runLogger.finish("success", {
        finalMessage: finalText,
        receipt,
      });
      return {
        ...(result as { messages?: unknown[] | undefined }),
        receipt,
      };
    } catch (error) {
      let receipt;
      try {
        receipt = withCreatorDiagnosticLog(await activity.finish(), runLogger);
      } catch (transactionError) {
        await runLogger.record("transaction_persist_error", {
          error: transactionError,
        });
      }
      await runLogger.finish(options.signal?.aborted ? "aborted" : "error", {
        error,
        receipt,
      });
      throw error;
    }
  };

  return new CreatorSession(invoke, streamInvoke);
}
