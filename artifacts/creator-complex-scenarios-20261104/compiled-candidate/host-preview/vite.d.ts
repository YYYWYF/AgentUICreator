import type { Plugin } from "vite";
/** Logical paths relative to the generated source root, including Windows input. */
export declare function requiresCreatorHostReload(relativeFile: string): boolean;
/** Inject one shared adapter into real Hosts; no Creator client is included in builds. */
export declare function createCreatorHostPreviewPlugin(options?: {
    creatorOrigin?: string;
    workspaceId?: string;
}): Plugin;
//# sourceMappingURL=vite.d.ts.map