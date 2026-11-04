import { ChatOpenAI } from "@langchain/openai";
export declare function hostEnvironment(root?: string): Record<string, string | undefined>;
export declare function createModel(environment: Record<string, string | undefined>, threadId: string): ChatOpenAI<import("@langchain/openai").ChatOpenAICallOptions>;
//# sourceMappingURL=config.d.ts.map