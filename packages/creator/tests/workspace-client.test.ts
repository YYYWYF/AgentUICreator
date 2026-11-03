import { afterEach, expect, it, vi } from "vitest";
import { CREATOR_LOCALES } from "../src/ui/i18n/locale.js";
import { executeCreatorCommand, getWorkspaceState, selectWorkspaceProject } from "../src/ui/workspaceClient.js";

afterEach(() => vi.unstubAllGlobals());

it("reads workspace JSON and preserves structured API failures", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ status: "none" }))
    .mockResolvedValueOnce(Response.json({ code: "CREATOR_WORKSPACE_NOT_DIRECTORY", error: "Choose a directory." }, { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  expect(await getWorkspaceState()).toEqual({ status: "none" });
  await expect(selectWorkspaceProject("C:\\work\\项目 alpha")).rejects.toMatchObject({
    name: "CreatorWorkspaceRequestError", code: "CREATOR_WORKSPACE_NOT_DIRECTORY", message: "Choose a directory.",
  });
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ projectRoot: "C:\\work\\项目 alpha" });
});

it.each(["en-US", "zh-CN"] as const)("explains HTML fallbacks and malformed JSON in %s", async locale => {
  const messages = CREATOR_LOCALES[locale];
  for (const response of [
    new Response('<script type="module" src="/@vite/client"></script>', { headers: { "Content-Type": "text/html" } }),
    new Response("", { status: 404 }),
    new Response("<html>Error</html>", { status: 500, headers: { "Content-Type": "application/json" } }),
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(getWorkspaceState(messages)).rejects.toMatchObject({
      name: "CreatorWorkspaceRequestError", code: "CREATOR_WORKSPACE_RESPONSE_INVALID",
      message: messages.errors.workspaceResponseInvalid,
    });
  }
});

it("also protects command responses from HTML fallbacks", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>")));
  await expect(executeCreatorCommand("workspace", { id: "sync", args: {} })).rejects.toMatchObject({ code: "CREATOR_WORKSPACE_RESPONSE_INVALID" });
});

it("preserves cancellation while reading a response", async () => {
  const response = Response.json({});
  vi.spyOn(response, "json").mockRejectedValue(new DOMException("Aborted", "AbortError"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(getWorkspaceState()).rejects.toMatchObject({ name: "AbortError" });
});
