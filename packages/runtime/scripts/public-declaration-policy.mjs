/** The only upstream type seams in public declarations. Value imports are never allowed. */
export const allowedAssistantUiTypeImports = new Map([
  ["@assistant-ui/react", new Set(["AttachmentAdapter", "DictationAdapter"])],
  // Defining-module fallback: react 0.15.22 pulls invalid Radix declarations into strict consumers.
  // The published-package consumer check requires core to be a declared dependency.
  ["@assistant-ui/core", new Set(["AttachmentAdapter", "DictationAdapter"])],
]);

const forbiddenTokens = [
  "@assistant-ui/", "AssistantUi", "AssistantRuntime", "ThreadPrimitive",
  "ComposerPrimitive", "MessagePrimitive", "useAui", "AuiConfig", "runtime-assistant-ui",
];

// Match named type imports regardless of line breaks. Unrecognized import forms,
// exports and import() references receive no exemption and fail the token scan.
const namedTypeImport = /\bimport\s+type\s*\{([^{}]*)\}\s*from\s*(["'])([^"']+)\2/gu;

export function findPublicDeclarationViolations(source) {
  const allowedModuleRanges = [];
  for (const match of source.matchAll(namedTypeImport)) {
    const allowedTypes = allowedAssistantUiTypeImports.get(match[3]);
    const importedNames = match[1].split(",").map(name => name.trim()).filter(Boolean);
    if (!allowedTypes || importedNames.length === 0 ||
        importedNames.some(name => !allowedTypes.has(name))) continue;
    // Only this module-specifier occurrence is allowed. The source is never rewritten.
    const start = match.index + match[0].lastIndexOf(match[3]);
    allowedModuleRanges.push({ start, end: start + match[3].length });
  }

  const violations = new Set();
  for (const token of forbiddenTokens) {
    let position = source.indexOf(token);
    while (position !== -1) {
      const allowed = token === "@assistant-ui/" && allowedModuleRanges.some(
        range => position >= range.start && position + token.length <= range.end,
      );
      if (!allowed) violations.add(token);
      position = source.indexOf(token, position + token.length);
    }
  }
  return [...violations];
}
