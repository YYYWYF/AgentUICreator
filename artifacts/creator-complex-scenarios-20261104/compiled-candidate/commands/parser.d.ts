export type ParsedCreatorCommand = {
    kind: "text";
} | {
    kind: "command";
    id: string;
    args: string[];
};
/** A leading slash always belongs to the deterministic namespace, including unknown commands. */
export declare function parseCreatorCommand(input: string): ParsedCreatorCommand;
//# sourceMappingURL=parser.d.ts.map