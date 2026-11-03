import { expect, it, vi } from "vitest";
import { createConversationServiceThreadBinding } from "../src/ui/agent-ui/conversation/threads/conversation-service-thread-binding.js";
import { createConversationService } from "../src/ui/services/conversations/service.js";
import { createEmptyConversationDataSource } from "../src/ui/services/conversations/data-source.js";

it("keeps ephemeral title and archive mutations inside the upstream local thread list", async () => {
  const dataSource = { ...createEmptyConversationDataSource(), rename: vi.fn(async () => { throw new Error("Must not persist local thread"); }), archive: vi.fn(async () => { throw new Error("Must not persist local thread"); }), unarchive: vi.fn(async () => { throw new Error("Must not persist local thread"); }) };
  const service = createConversationService({ dataSource }), binding = createConversationServiceThreadBinding(); binding.attachConversationService(service);
  const id = binding.getThreadId();
  try {
    await expect(binding.renameThread!(id, "Local title")).resolves.toBeUndefined();
    await expect(binding.archiveThread!(id)).resolves.toBeUndefined();
    await expect(binding.unarchiveThread!(id)).resolves.toBeUndefined();
    expect(dataSource.rename).not.toHaveBeenCalled(); expect(dataSource.archive).not.toHaveBeenCalled(); expect(dataSource.unarchive).not.toHaveBeenCalled();
  } finally { service.dispose(); }
});

it("persists all mutations once an ephemeral identity appears in backend history", async () => {
  let persisted = false;
  const dataSource = { ...createEmptyConversationDataSource(), list: async () => persisted ? [{ id: "local", title: "Saved", status: "regular" as const }] : [], rename: vi.fn(async () => {}), archive: vi.fn(async () => {}), unarchive: vi.fn(async () => {}) };
  const service = createConversationService({ dataSource }), binding = createConversationServiceThreadBinding(); binding.reserveThread!("local"); binding.attachConversationService(service);
  try {
    await binding.renameThread!("local", "Before save"); expect(dataSource.rename).not.toHaveBeenCalled(); persisted = true; await service.refresh();
    await binding.renameThread!("local", "After save"); await binding.archiveThread!("local"); await binding.unarchiveThread!("local");
    expect(dataSource.rename).toHaveBeenCalledExactlyOnceWith("local", "After save"); expect(dataSource.archive).toHaveBeenCalledExactlyOnceWith("local"); expect(dataSource.unarchive).toHaveBeenCalledExactlyOnceWith("local");
    dataSource.rename.mockRejectedValueOnce(new Error("Persistence unavailable")); await expect(binding.renameThread!("local", "Rejected")).rejects.toThrow("Persistence unavailable");
  } finally { service.dispose(); }
});

it("retains missing-operation errors for identities that are not ephemeral", async () => {
  const service = createConversationService({ dataSource: createEmptyConversationDataSource() }), binding = createConversationServiceThreadBinding(); binding.attachConversationService(service);
  try {
    await expect(binding.renameThread!("backend", "Title")).rejects.toThrow("CONVERSATION_OPERATION_NOT_CONFIGURED");
    await expect(binding.archiveThread!("backend")).rejects.toThrow("CONVERSATION_OPERATION_NOT_CONFIGURED");
    await expect(binding.unarchiveThread!("backend")).rejects.toThrow("CONVERSATION_OPERATION_NOT_CONFIGURED");
  } finally { service.dispose(); }
});
