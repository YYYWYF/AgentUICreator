export interface MockConversationFixture {
    summary: {
        id: string;
        title: string;
        group?: string | undefined;
        updatedAt?: string | undefined;
        disabled?: boolean | undefined;
    };
    detail: {
        id: string;
        title: string;
        state: {
            values: {
                messages?: unknown[] | undefined;
                [key: string]: unknown;
            };
            next?: unknown;
            metadata?: unknown;
            createdAt?: string | undefined;
            tasks?: unknown[] | undefined;
        };
        agentState?: unknown;
    };
    /** Development documentation only; it is never consumed by the Runtime. */
    sourceScenarioId?: string | undefined;
}
export declare const mockConversationFixtures: readonly MockConversationFixture[];
export declare const mockConversationList: {
    conversations: MockConversationFixture["summary"][];
};
export declare const mockConversationDetails: MockConversationFixture["detail"][];
//# sourceMappingURL=fixtures.d.ts.map