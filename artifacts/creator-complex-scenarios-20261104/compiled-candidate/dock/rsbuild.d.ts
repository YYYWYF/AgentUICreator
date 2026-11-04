import { type CreatorDockIntegrationOptions } from "./integration.js";
type HtmlTag = {
    tag: string;
    attrs?: Record<string, string | boolean | null | undefined>;
    children?: string;
    metadata?: Record<string, unknown>;
};
type HtmlTags = {
    headTags: HtmlTag[];
    bodyTags: HtmlTag[];
};
/** Structural API keeps the user's Rsbuild version owned by their tool host. */
interface CreatorDockRsbuildAPI {
    onBeforeStartDevServer(callback: () => void): void;
    onBeforeBuild(callback: () => void): void;
    onCloseDevServer(callback: () => void): void;
    modifyHTMLTags(callback: (tags: HtmlTags) => HtmlTags): void;
    modifyRsbuildConfig(callback: (config: unknown) => void): void;
}
export declare function createCreatorDockRsbuildPlugin(options?: CreatorDockIntegrationOptions): {
    name: string;
    setup(api: CreatorDockRsbuildAPI): void;
};
export {};
//# sourceMappingURL=rsbuild.d.ts.map