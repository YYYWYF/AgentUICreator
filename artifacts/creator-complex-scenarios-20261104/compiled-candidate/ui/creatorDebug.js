/** Creator diagnostics require an explicit URL opt-in, including on local hosts. */
export function resolveCreatorDebugMode({ search, }) {
    const explicitValue = new URLSearchParams(search).get("creatorDebug");
    if (explicitValue === null) {
        return false;
    }
    const normalized = explicitValue.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
}
//# sourceMappingURL=creatorDebug.js.map