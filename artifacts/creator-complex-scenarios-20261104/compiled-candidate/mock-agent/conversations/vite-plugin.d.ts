import type { Plugin } from "vite";
export interface MockConversationApiVitePluginOptions {
    endpoint?: string | undefined;
    listDelayMs?: number | undefined;
    detailDelayMs?: number | undefined;
}
export declare function createMockConversationApiVitePlugin(options?: MockConversationApiVitePluginOptions): Plugin;
//# sourceMappingURL=vite-plugin.d.ts.map