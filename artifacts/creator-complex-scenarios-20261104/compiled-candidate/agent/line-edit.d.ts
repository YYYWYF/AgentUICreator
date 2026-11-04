/** Line editing preserves untouched bytes and the affected file's line boundaries. */
export declare function editReadLines(content: string, input: {
    mode: "replace_lines" | "insert_before_line" | "insert_after_line";
    start_line: number;
    end_line?: number;
    replacement: string;
}): string;
//# sourceMappingURL=line-edit.d.ts.map