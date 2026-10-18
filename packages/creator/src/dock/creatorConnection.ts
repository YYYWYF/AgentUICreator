/** The host remains usable while Creator is stopped. Preserve the dock between
 * successful probes; release its iframe/listeners when the service goes away. */
export function watchCreatorConnection(statusUrl: string, install: () => () => void): () => void {
  let disposeDock: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let stopped = false;
  let generation = 0;
  const probe = async () => {
    const current = ++generation;
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), 2000);
    let online = false;
    try {
      const response = await fetch(statusUrl, { cache: "no-store", signal: request.signal });
      online = response.ok && (await response.json() as { online?: boolean }).online === true;
    } catch { /* Creator and the host have independent lifecycles. */ }
    finally { clearTimeout(timeout); }
    if (stopped || current !== generation) return;
    if (online) disposeDock ??= install();
    else { disposeDock?.(); disposeDock = undefined; }
    timer = setTimeout(() => { void probe(); }, 2000);
  };
  const pause = () => {
    stopped = true;
    generation++;
    clearTimeout(timer);
    controller?.abort();
    disposeDock?.();
    disposeDock = undefined;
  };
  const resume = () => { if (stopped) { stopped = false; void probe(); } };
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", resume);
  void probe();
  return () => {
    pause();
    window.removeEventListener("pagehide", pause);
    window.removeEventListener("pageshow", resume);
  };
}
