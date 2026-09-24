import { z } from "zod";

export const CUSTOM_EVENT_NAME_MAX_LENGTH = 128;

export const RESERVED_CUSTOM_EVENT_NAMESPACE_ROOTS = [
  "run",
  "message",
  "tool",
  "reasoning",
  "step",
  "subagent",
  "interrupt",
  "state",
  "agent-ui",
  "ag-ui",
] as const;

function containsControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value);
}

export function isReservedCustomEventName(name: string): boolean {
  const lower = name.toLowerCase();

  return RESERVED_CUSTOM_EVENT_NAMESPACE_ROOTS.some(
    (root) => lower === root || lower.startsWith(`${root}.`),
  );
}

export const customEventNameSchema = z
  .string()
  .min(1, "Custom Event name must not be empty")
  .max(
    CUSTOM_EVENT_NAME_MAX_LENGTH,
    `Custom Event name must not exceed ${CUSTOM_EVENT_NAME_MAX_LENGTH} characters`,
  )
  .refine(
    (name) => name.trim().length > 0,
    "Custom Event name must not be blank",
  )
  .refine(
    (name) => name === name.trim(),
    "Custom Event name must not contain leading or trailing whitespace",
  )
  .refine(
    (name) => !containsControlCharacter(name),
    "Custom Event name must not contain control characters",
  )
  .refine(
    (name) => !isReservedCustomEventName(name),
    "Custom Event name uses a reserved Agent Runtime namespace",
  );
