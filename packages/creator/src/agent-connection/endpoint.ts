/** Relative addresses are resolved only against the business page, never Creator. */
export function resolveAgentConnectionEndpoint(endpoint: string, businessPageUrl?: string): string {
  const value = endpoint.trim();
  if (!value) throw new Error("Invalid Agent endpoint.");
  let url: URL;
  try { url = new URL(value); }
  catch {
    if (/^[a-z][a-z\d+.-]*:/iu.test(value)) throw new Error("Invalid Agent endpoint.");
    if (!businessPageUrl) throw new Error("BUSINESS_PAGE_URL_REQUIRED");
    const base = new URL(businessPageUrl);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("BUSINESS_PAGE_URL_REQUIRED");
    url = new URL(value, base);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("Use an HTTP(S) Agent endpoint without credentials or fragments.");
  }
  return url.href;
}
