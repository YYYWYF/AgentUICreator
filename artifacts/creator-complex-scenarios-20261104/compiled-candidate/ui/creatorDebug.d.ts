export interface CreatorDebugLocation {
    hostname: string;
    search: string;
}
/** Creator diagnostics require an explicit URL opt-in, including on local hosts. */
export declare function resolveCreatorDebugMode({ search, }: CreatorDebugLocation): boolean;
//# sourceMappingURL=creatorDebug.d.ts.map