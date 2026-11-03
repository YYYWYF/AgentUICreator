import { CREATOR_BUSINESS_PAGE_REQUEST, CREATOR_BUSINESS_PAGE_RESULT } from "./protocol.js";

/** Ask the existing authenticated Host bridge for the current page URL. */
export function requestBusinessPageUrl(workspaceId: string): Promise<string | undefined> {
  return new Promise(resolve => {
    const requestId = crypto.randomUUID();
    const finish = (url?: string) => {
      clearTimeout(timer);
      window.removeEventListener(CREATOR_BUSINESS_PAGE_RESULT, result);
      resolve(url);
    };
    const result = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.workspaceId === workspaceId && detail?.requestId === requestId && typeof detail.pageUrl === "string") finish(detail.pageUrl);
    };
    const timer = setTimeout(() => finish(), 1500);
    window.addEventListener(CREATOR_BUSINESS_PAGE_RESULT, result);
    window.dispatchEvent(new CustomEvent(CREATOR_BUSINESS_PAGE_REQUEST, { detail: { workspaceId, requestId } }));
  });
}
