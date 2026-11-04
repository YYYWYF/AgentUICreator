/** A leading slash always belongs to the deterministic namespace, including unknown commands. */
export function parseCreatorCommand(input) {
    const text = input.trim();
    if (!text.startsWith("/"))
        return { kind: "text" };
    const [id = "", ...args] = text.slice(1).split(/\s+/);
    return { kind: "command", id, args };
}
//# sourceMappingURL=parser.js.map