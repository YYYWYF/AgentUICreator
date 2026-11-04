import { type CreatorProcessManagerOptions } from "./CreatorProcessManager.js";
export interface CreateCreatorClientOptions extends CreatorProcessManagerOptions {
}
export interface CreatorRunResult {
    message: string;
    result: unknown;
}
export declare class CreatorClient {
    #private;
    constructor(options: CreateCreatorClientOptions);
    get processId(): number | undefined;
    run(request: string): Promise<CreatorRunResult>;
    dispose(): Promise<void>;
}
export declare function createCreatorClient(options: CreateCreatorClientOptions): CreatorClient;
//# sourceMappingURL=CreatorClient.d.ts.map