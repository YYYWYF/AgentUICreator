export function normalizeTimingScale(value) {
    if (!Number.isFinite(value))
        return 1;
    return Math.min(10, Math.max(0, value ?? 1));
}
export async function waitForDelay(durationMs, signal, timingScale) {
    if (signal?.aborted)
        return false;
    const scaledDurationMs = durationMs * timingScale;
    if (scaledDurationMs <= 0)
        return true;
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve(true);
        }, scaledDurationMs);
        const onAbort = () => {
            clearTimeout(timer);
            resolve(false);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
//# sourceMappingURL=timing.js.map