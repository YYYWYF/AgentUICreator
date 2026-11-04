/** Copyable presentation guidance only; never executed by the resource installer. */
export function packageInstallCommand(packages) {
    const args = [...new Set(packages.map(item => `${item.name}@${item.required}`))];
    // Shell-quote complex ranges; simple version selectors remain readable.
    return `pnpm add ${args.map(value => /^[a-zA-Z0-9@/._^~+-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\\''") + "'").join(" ")}`;
}
//# sourceMappingURL=package-install-guidance.js.map