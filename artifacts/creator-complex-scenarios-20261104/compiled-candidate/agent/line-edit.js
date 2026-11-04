/** Line editing preserves untouched bytes and the affected file's line boundaries. */
export function editReadLines(content, input) {
    const lines = content.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
    // read_file numbers the empty line at EOF too (including an empty file).
    if (!lines.length || content.endsWith("\n"))
        lines.push("");
    const end = input.end_line ?? input.start_line;
    if (!Number.isSafeInteger(input.start_line) || !Number.isSafeInteger(end) || input.start_line < 1 || end < input.start_line || end > lines.length)
        throw new Error("READ_RANGE_REQUIRED");
    const start = input.mode === "insert_after_line" ? end : input.start_line - 1;
    const count = input.mode === "replace_lines" ? end - input.start_line + 1 : 0;
    const eol = /\r?\n/u.exec(lines.slice(input.start_line - 1, end).join(""))?.[0] ?? /\r?\n/u.exec(content)?.[0] ?? "\n";
    const prefix = lines.slice(0, start).join(""), suffix = lines.slice(start + count);
    let replacement = input.replacement.replace(/\r\n|\r|\n/gu, eol);
    if (replacement) {
        if (prefix && !prefix.endsWith("\n"))
            replacement = eol + replacement;
        if ((suffix.length || content.endsWith("\n")) && !replacement.endsWith("\n"))
            replacement += eol;
    }
    return prefix + replacement + suffix.join("");
}
//# sourceMappingURL=line-edit.js.map