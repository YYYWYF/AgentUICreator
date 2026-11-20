/** Keep caller cancellation and the streaming deadline on early Node 20 too. */
export function combineAbortSignals(signals: readonly AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([...signals]);
  return fallbackAbortSignalAny(signals);
}

function fallbackAbortSignalAny(signals: readonly AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();
  const abort = (signal: AbortSignal) => {
    const reason: unknown = signal.reason;
    controller.abort(reason);
    for (const [source, listener] of listeners) source.removeEventListener("abort", listener);
    listeners.clear();
  };
  for (const signal of signals) {
    if (signal.aborted) { abort(signal); break; }
    if (listeners.has(signal)) continue;
    const listener = () => abort(signal);
    listeners.set(signal, listener);
    signal.addEventListener("abort", listener, { once: true });
  }
  return controller.signal;
}

/** LangChain also consumes this standard API inside the Creator process. */
export function installAbortSignalAny(): void {
  if (typeof AbortSignal.any !== "function") Object.defineProperty(AbortSignal, "any", {
    value: fallbackAbortSignalAny, configurable: true, writable: true,
  });
}

/** Early Node 20 loses the abort reason while reading fetch response bodies. */
export function preserveStreamAbortReason(response: Response, signal: AbortSignal): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) controller.close();
        else controller.enqueue(result.value);
      } catch (error) {
        controller.error(signal.aborted ? signal.reason : error);
      }
    },
    cancel: (reason: unknown) => reader.cancel(reason),
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
