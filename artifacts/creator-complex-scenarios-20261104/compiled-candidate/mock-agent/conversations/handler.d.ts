import type { IncomingMessage, ServerResponse } from "node:http";
import { type MockConversationFixture } from "./fixtures.js";
import { type MockDurableRunStore } from "../durable-run-store.js";
export interface MockConversationApiHandlerOptions {
    endpoint?: string | undefined;
    durableStore?: MockDurableRunStore;
    fixtures?: readonly MockConversationFixture[] | undefined;
    listDelayMs?: number | undefined;
    detailDelayMs?: number | undefined;
}
export type MockConversationApiHandler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;
export declare function createMockConversationApiHandler({ endpoint, durableStore, fixtures, listDelayMs, detailDelayMs, }?: MockConversationApiHandlerOptions): MockConversationApiHandler;
//# sourceMappingURL=handler.d.ts.map