import { expect, it, vi } from "vitest";
import { formTools } from "@assistant-ui/react-hook-form";
import { createReactHookFormFrontendTools, reactHookFormToolContracts } from "./fixtures/official-form/integrations/react-hook-form";
import { AppFrontendToolRegistry, AppFrontendToolRuntime } from "../runtime/tools";

it("uses public upstream semantics for all three tool descriptions", () => {
  for (const name of ["set_form_field", "submit_form", "reset_form"] as const) {
    expect(reactHookFormToolContracts[name].description).toBe(formTools[name].description);
  }
});
it("grants nothing on import and exposes only application-authorized operations", () => {
  expect(new AppFrontendToolRegistry([]).list()).toEqual([]);
  const tools = createReactHookFormFrontendTools({ serviceName: "test.form", fields: ["email"], expose: ["set_form_field"] });
  expect(tools.map(tool => tool.name)).toEqual(["set_form_field"]);
  expect(tools[0]!.inputSchema.safeParse({ name: "other", value: "alice" }).success).toBe(false);
  expect(tools[0]!.inputSchema.safeParse({ name: "email", value: "alice", extra: true }).success).toBe(false);
  expect(createReactHookFormFrontendTools({ serviceName: "test.form", fields: ["email"], expose: [] })).toEqual([]);
});

it("advertises only explicit exposure and hides it when the Service is unavailable", async () => {
  const capability = { setField: vi.fn(), submit: vi.fn(), reset: vi.fn() };
  const values = new Map<string, unknown>([["test.form", capability]]);
  const services = { get<T = unknown>(name: string): T | undefined { return values.get(name) as T | undefined; } };
  // Package/adapter presence does not supply an application module to the allowlist.
  const empty = new AppFrontendToolRuntime(new AppFrontendToolRegistry([]));
  empty.connectServices(services);
  expect(empty.listTools()).toEqual([]);
  const runtime = new AppFrontendToolRuntime(new AppFrontendToolRegistry(createReactHookFormFrontendTools({ serviceName: "test.form", fields: ["email"], expose: ["set_form_field"] })));
  runtime.connectServices(services);
  expect(runtime.listTools().map(tool => tool.name)).toEqual(["set_form_field"]);
  const receipt = await runtime.execute({ id: "fill", producer: { type: "root" }, name: "set_form_field", input: { name: "email", value: "alice@example.com" } }, { signal: new AbortController().signal });
  expect(JSON.parse(receipt.content)).toEqual({ success: true, name: "email", value: "alice@example.com" });
  expect(capability.setField).toHaveBeenCalledWith("email", "alice@example.com");
  expect(capability.submit).not.toHaveBeenCalled();
  expect(capability.reset).not.toHaveBeenCalled();
  values.clear();
  expect(runtime.listTools()).toEqual([]);
});
