import { TypeFlags, type Symbol, type Type } from "typescript/unstable/sync";

/** Put the component/domain contract before inherited DOM details, without hiding either. */
export function prioritizePublicMembers(members: readonly Symbol[]) {
  const inherited = (member: Symbol) => member.declarations.length > 0 && member.declarations.every(declaration =>
    /\/(?:@types\/react|typescript\/lib)\//u.test(String(declaration.path).replaceAll("\\", "/")));
  const priority = (member: Symbol) => ["renderSlot", "renderScopedSlot"].includes(member.name) ? 1
    : ["className", "style"].includes(member.name) ? 0 : inherited(member) ? 2 : 0;
  return members.map((member, index) => ({ member, index, priority: priority(member) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index).map(item => item.member);
}

/** Scalar methods (String.toUpperCase, etc.) are not component configuration. */
export function isScalarPublicType(type: Type): boolean {
  if (type.isUnionType()) return type.getTypes().every(isScalarPublicType);
  return Boolean(type.flags & (TypeFlags.StringLike | TypeFlags.NumberLike | TypeFlags.BooleanLike |
    TypeFlags.BigIntLike | TypeFlags.ESSymbolLike | TypeFlags.Null | TypeFlags.Undefined |
    TypeFlags.Void | TypeFlags.Never | TypeFlags.Any | TypeFlags.Unknown));
}

export const PUBLIC_MODULE_PATTERN = /^@za38\.03\/agent-ui-(?:core|renderer|runtime|plugins|web-component)(?:\/[a-z][a-z0-9-]*)*$/u;
