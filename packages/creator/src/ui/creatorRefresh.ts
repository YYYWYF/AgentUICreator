import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages } from "./i18n/locale.js";
import { useEffect, useRef } from "react";
import type { UpdateInspection } from "@agent-ui/project-control/updates";
import type { AgentConnectionState } from "../agent-connection/types.js";
import type { CreatorMockState } from "../mock/types.js";
import type { MockDemoCompatibility } from "../mock/demo-compatibility.js";

export interface CreatorRefreshData {
  projectId: string;
  connection?: AgentConnectionState;
  mock?: CreatorMockState;
  compatibility?: MockDemoCompatibility;
  updates?: UpdateInspection;
}
const REFRESHED = "agent-ui-creator:data-refreshed";
export function publishCreatorRefresh(data: CreatorRefreshData) {
  window.dispatchEvent(new CustomEvent(REFRESHED, { detail: data }));
}
export function useCreatorRefresh(apply: (data: CreatorRefreshData) => void) {
  const latest = useRef(apply);
  latest.current = apply;
  useEffect(() => {
    const handle = (event: Event) => latest.current((event as CustomEvent<CreatorRefreshData>).detail);
    window.addEventListener(REFRESHED, handle);
    return () => window.removeEventListener(REFRESHED, handle);
  }, []);
}

export async function readRefreshJson<T>(url: string, body?: unknown, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error(localeMessages.errors.couldNotReadData);
  return response.json() as Promise<T>;
}
