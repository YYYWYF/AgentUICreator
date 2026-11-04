import { CREATOR_API_PATH } from "../shared.js";
function runError(code) { return Object.assign(new Error(code), { code }); }
/** Resume an SSE subscription by exact byte offset; never repeat an execution POST. */
export async function fetchCreatorRun(init, reconnect) {
    const input = JSON.parse(String(init.body));
    const signal = init.signal;
    let offset = 0;
    const attach = async () => {
        const query = new URLSearchParams({ threadId: input.threadId, runId: input.runId, offset: String(offset) });
        const response = await fetch(`${CREATOR_API_PATH}?${query}`, { method: "GET", ...(init.headers ? { headers: init.headers } : {}), ...(signal ? { signal } : {}) });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw runError(body.code ?? "CREATOR_RUN_CONNECTION_LOST");
        }
        return response;
    };
    let response;
    try {
        response = reconnect ? await attach() : await fetch(CREATOR_API_PATH, init);
    }
    catch (error) {
        if (reconnect || signal?.aborted)
            throw error;
        response = await attach();
    }
    if (!response.ok || !response.body)
        return response;
    let reader = response.body.getReader();
    let terminal = false, pending = "", failures = 0;
    const decoder = new TextDecoder();
    return new Response(new ReadableStream({
        async pull(controller) {
            for (;;) {
                try {
                    const next = await reader.read();
                    if (next.done) {
                        if (!terminal)
                            throw runError("CREATOR_RUN_STREAM_INCOMPLETE");
                        controller.close();
                        return;
                    }
                    offset += next.value.byteLength;
                    pending += decoder.decode(next.value, { stream: true });
                    let newline;
                    while ((newline = pending.indexOf("\n")) >= 0) {
                        const line = pending.slice(0, newline);
                        pending = pending.slice(newline + 1);
                        if (line.startsWith("data: ")) {
                            const event = JSON.parse(line.slice(6));
                            if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR")
                                terminal = true;
                        }
                    }
                    controller.enqueue(next.value);
                    return;
                }
                catch (error) {
                    if (signal?.aborted) {
                        controller.error(error);
                        return;
                    }
                    await reader.cancel().catch(() => undefined);
                    if (++failures > 3) {
                        controller.error(runError("CREATOR_RUN_CONNECTION_LOST"));
                        return;
                    }
                    try {
                        await new Promise((resolve, reject) => {
                            const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(runError("CREATOR_RUN_CONNECTION_LOST")); };
                            const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, failures * 300);
                            signal?.addEventListener("abort", abort, { once: true });
                            if (signal?.aborted)
                                abort();
                        });
                        reader = (await attach()).body.getReader();
                    }
                    catch (attachError) {
                        controller.error(attachError);
                        return;
                    }
                }
            }
        },
        async cancel(reason) { await reader.cancel(reason).catch(() => undefined); },
    }), { status: response.status, headers: response.headers });
}
//# sourceMappingURL=creatorRunTransport.js.map