export interface CreatorDockIntegrationOptions {
    creatorUrl?: string;
    projectRoot?: string;
    locale?: "en-US" | "zh-CN";
}
export interface CreatorDockHtmlTag {
    tag: string;
    attrs: Record<string, string | boolean>;
}
export declare function creatorDockIntegration(options?: CreatorDockIntegrationOptions): {
    script: CreatorDockHtmlTag;
    proxies: {
        [k: string]: {
            target: string;
            changeOrigin: boolean;
            headers: {
                "x-agent-ui-workspace-id": string;
                origin: string;
            };
        };
    };
    workspaceId: string;
};
//# sourceMappingURL=integration.d.ts.map