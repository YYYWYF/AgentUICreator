import { z } from "zod";
import type { ToolContext } from "./tools.js";
export declare const creatorPostconditions: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"plugin_enabled">;
    pluginId: z.ZodString;
    enabled: z.ZodBoolean;
    instanceId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"file_text">;
    path: z.ZodString;
    text: z.ZodString;
    present: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>], "kind">>;
export type CreatorPostcondition = z.infer<typeof creatorPostconditions>[number];
/** Exact, read-only goal facts. These are neither runtime tests nor mutation grants. */
export declare function checkCreatorPostconditions(context: ToolContext, checks: CreatorPostcondition[]): Promise<{
    status: string;
    facts: ({
        kind: "plugin_enabled";
        pluginId: string;
        enabled: boolean;
        instanceId?: string | undefined;
        matched: any;
        known: any;
        instanceIds: any;
        enabledInstanceIds: any;
    } | {
        kind: "file_text";
        path: string;
        text: string;
        present: boolean;
        matched: boolean;
        hash: string;
    })[];
    evidenceBoundary: string;
}>;
//# sourceMappingURL=outcome.d.ts.map