import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES } from "./i18n/locale.js";
import { useEffect, useRef } from "react";
const REFRESHED = "agent-ui-creator:data-refreshed";
export function publishCreatorRefresh(data) {
    window.dispatchEvent(new CustomEvent(REFRESHED, { detail: data }));
}
export function useCreatorRefresh(apply) {
    const latest = useRef(apply);
    latest.current = apply;
    useEffect(() => {
        const handle = (event) => latest.current(event.detail);
        window.addEventListener(REFRESHED, handle);
        return () => window.removeEventListener(REFRESHED, handle);
    }, []);
}
export async function readRefreshJson(url, body, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    const response = await fetch(url, {
        cache: "no-store",
        ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
        throw new Error(localeMessages.errors.couldNotReadData);
    return response.json();
}
//# sourceMappingURL=creatorRefresh.js.map