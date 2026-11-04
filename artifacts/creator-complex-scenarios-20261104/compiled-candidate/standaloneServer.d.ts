import { createCreatorHttpService } from "./creatorHttpService.js";
/** Serve the development API and host-embedded Dock assets; no standalone UI. */
export declare function startCreatorWorkbench(options?: {
    configRoot?: string;
    projectRoot?: string;
    port?: number;
    browserRoot?: string;
    service?: Pick<ReturnType<typeof createCreatorHttpService>, "mount" | "dispose">;
}): Promise<{
    url: string;
    close: () => Promise<void>;
}>;
//# sourceMappingURL=standaloneServer.d.ts.map