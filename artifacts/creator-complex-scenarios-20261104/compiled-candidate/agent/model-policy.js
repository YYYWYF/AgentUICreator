import { ToolMessage } from "@langchain/core/messages";
export function retryKind(error) {
    let current = error;
    const seen = new Set();
    for (let depth = 0; current && depth < 8 && !seen.has(current); depth++, current = current.cause) {
        seen.add(current);
        const status = Number(current.status ?? current.statusCode ?? 0);
        const message = String(current.message ?? "");
        if (status === 409 && /duplicate[\s_-]+request/iu.test(message) && /already[\s_-]+(?:being[\s_-]+)?process/iu.test(message))
            return "fresh";
        if ([408, 429, 500, 502, 503, 504].includes(status))
            return "short";
        if (["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"].includes(current.code) || /APIConnectionError|RemoteProtocolError/iu.test(String(current.name)))
            return "fresh";
        if (["ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(current.code) || /TimeoutError/iu.test(String(current.name)))
            return "short";
    }
    return undefined;
}
export async function retryDelay(milliseconds, signal) {
    signal.throwIfAborted();
    await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
        signal.addEventListener("abort", abort, { once: true });
    });
}
/** Project only redundant inspection payloads. Checkpoints, user constraints,
 * source reads, approvals, errors and mutation receipts remain unchanged. */
export function compactToolContext(messages) {
    const calls = new Map();
    for (const message of messages)
        for (const call of message.tool_calls ?? [])
            calls.set(call.id, call);
    const latest = new Map();
    const keyAt = new Map();
    for (const [index, message] of messages.entries()) {
        const call = calls.get(message.tool_call_id);
        if (!call || !/^(inspect_|list_)/u.test(call.name) || /(?:transaction|baseline)/u.test(call.name) || typeof message.content !== "string")
            continue;
        try {
            const value = JSON.parse(message.content);
            if (value.ok !== true)
                continue;
            const key = JSON.stringify([call.name, call.args]);
            latest.set(key, index);
            keyAt.set(index, key);
        }
        catch { /* Invalid/error observations are never compacted into success. */ }
    }
    return messages.map((message, index) => {
        const key = keyAt.get(index);
        if (!key || latest.get(key) === index)
            return message;
        return new ToolMessage({ id: message.id, name: message.name, tool_call_id: message.tool_call_id, content: JSON.stringify({ archived: true, reason: "superseded_same_query", useLatestToolCallId: messages[latest.get(key)].tool_call_id }) });
    });
}
//# sourceMappingURL=model-policy.js.map