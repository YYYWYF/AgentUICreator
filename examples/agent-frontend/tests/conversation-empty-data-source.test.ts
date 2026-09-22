import { describe, expect, it } from "vitest";

import { createEmptyConversationDataSource } from "../services/conversations";

describe("EmptyConversationDataSource", () => {
  it("treats an unconfigured history backend as a normal empty list", async () => {
    const source = createEmptyConversationDataSource();
    await expect(source.list()).resolves.toEqual([]);
    await expect(source.get("missing")).rejects.toThrow(
      'Conversation "missing" does not exist in the empty data source.',
    );
  });
});
