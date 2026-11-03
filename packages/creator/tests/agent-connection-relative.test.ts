import { expect, it } from "vitest";
import { resolveAgentConnectionEndpoint } from "../src/agent-connection/endpoint.js";

it.each([
  ["/api/agent", "http://localhost:5173/orders/page", "http://localhost:5173/api/agent"],
  ["./agent", "http://localhost:5173/orders/", "http://localhost:5173/orders/agent"],
  ["../agent?project=1", "https://host.test/app/orders/", "https://host.test/app/agent?project=1"],
  ["/接口/agent?x=1", "https://host.test/业务/", "https://host.test/%E6%8E%A5%E5%8F%A3/agent?x=1"],
  [" https://backend.test/agent ", "http://localhost:5173/", "https://backend.test/agent"],
])("resolves %s against the business page %s", (input, page, expected) => {
  expect(resolveAgentConnectionEndpoint(input, page)).toBe(expected);
});

it("never substitutes a Creator origin when the business page is unavailable", () => {
  expect(() => resolveAgentConnectionEndpoint("/api/agent")).toThrow("BUSINESS_PAGE_URL_REQUIRED");
  expect(resolveAgentConnectionEndpoint("https://backend.test/agent")).toBe("https://backend.test/agent");
});

it.each(["file:///tmp/agent", "javascript:alert(1)", "http://user:secret@host.test/agent", "/agent#fragment", "http://", "C:\\work\\agent"])("retains URL restrictions for %s", input => {
  expect(() => resolveAgentConnectionEndpoint(input, "https://host.test/app/")).toThrow();
});
