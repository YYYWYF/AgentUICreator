export declare class DebuggingEvidence {
    readonly observed: Map<string, any>;
    readonly selected: Set<string>;
    runtimeBaseline: Set<string> | undefined;
    runtimeCurrent: Set<string> | undefined;
    runtimeRevision: number | undefined;
    staticCurrent: Set<string> | undefined;
    staticRevision: number | undefined;
    observeStatic(result: any): void;
    observeRuntime(result: any, revision: number): void;
    select(id: string, revision: number): any;
    assertPath(file: string, source: string): void;
    staticRemaining(current: Set<string>): string[];
    runtimeView(result: any): any;
}
export declare const staticTargetId: (message: string) => string;
//# sourceMappingURL=debugging.d.ts.map