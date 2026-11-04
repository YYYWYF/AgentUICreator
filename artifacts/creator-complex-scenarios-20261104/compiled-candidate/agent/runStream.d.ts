import type { ServerResponse } from "node:http";
/** A run owns its event log; HTTP responses are disposable subscribers. */
export declare class CreatorRunStream {
    #private;
    readonly threadId: string;
    readonly inputHash: string;
    constructor(threadId: string, input: unknown, directory: string);
    static hash(input: unknown): string;
    publish(event: object): Promise<void>;
    finish(): void;
    attach(response: ServerResponse, offset?: number): void;
}
//# sourceMappingURL=runStream.d.ts.map