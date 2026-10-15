export const USER_DETAIL_FIELDS = ["firstName", "lastName", "email", "projectIdea"] as const;
export type UserDetails = Record<(typeof USER_DETAIL_FIELDS)[number], string>;
export interface UserDetailsResult { values: UserDetails }

export const collectUserDetailsParameters = {
  type: "object", additionalProperties: false, properties: {},
} as const;

export function parseUserDetailsResult(value: unknown): UserDetailsResult | undefined {
  if (typeof value === "string") {
    try { value = JSON.parse(value) as unknown; } catch { return undefined; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const values = (value as { values?: unknown }).values;
  if (!values || typeof values !== "object" || Array.isArray(values) ||
      Object.keys(values).length !== USER_DETAIL_FIELDS.length) return undefined;
  const fields = values as UserDetails;
  if (USER_DETAIL_FIELDS.some(name => !Object.hasOwn(fields, name) || typeof fields[name] !== "string" || fields[name].length > 4000) ||
      !fields.firstName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return undefined;
  return { values: fields };
}
