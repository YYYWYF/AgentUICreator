import { expect, it, vi } from "vitest";
import {
  createConversationService,
  createConversationThreadBindingFactory,
} from "../dist/sources/takeover/conversation-service/index";
import { PluginServiceRuntimeContext as oldContext } from "../src/plugin-api/PluginServiceContext";
import { PluginServiceRuntimeContext } from "@za38.03/agent-ui-runtime/plugin-api";

it("delivers history/cache/CRUD behavior with the source-owned service and shares the npm Context", async () => {
  expect(oldContext).toBe(PluginServiceRuntimeContext);
  const get = vi.fn(async (id: string) => ({
    id,
    title: "Saved",
    history: {
      format: "langchain" as const,
      messages: [{ type: "human", content: "History" }],
    },
  }));
  const remove = vi.fn(async () => {});
  const service = createConversationService({
    dataSource: {
      list: async () => [{ id: "saved", title: "Saved" }],
      get,
      delete: remove,
    },
  });
  await service.refresh();
  const binding = createConversationThreadBindingFactory(service)({
    initialThreadId: "saved",
  });
  try {
    expect(binding.getThreadListSnapshot?.().threads[0]?.id).toBe("saved");
    expect(
      (await binding.loadThread!("saved")).messages[0]?.content,
    ).toMatchObject([{ type: "text", text: "History" }]);
    service.showConversation("saved");
    expect(service.getSnapshot().activeConversation?.title).toBe("Saved");
    expect(get).toHaveBeenCalledTimes(1);
    await binding.deleteThread!("saved");
    expect(remove).toHaveBeenCalledWith("saved");
  } finally {
    binding.dispose?.();
    service.dispose();
  }
});
