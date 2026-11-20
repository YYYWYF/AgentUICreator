/** Declaration names are logical paths, even when a caller uses Windows paths. */
export function publicPresentationFiles(delivery) {
  return Array.isArray(delivery.publicPresentationTypes)
    ? delivery.publicPresentationTypes
    : delivery.publicPresentationTypes ? delivery.presentation : [];
}

export const sourceRuntimeDeclarations = new Set([
  "composer-skill", "quote-lifecycle", "quote-thread-root", "quote-selection-adapter", "quote-selection-root", "quote-selection-action",
  "task-disclosure-context", "tool-renderer-context", "conversation-turn", "thread-delete-recovery",
  "directive-formatter", "trigger-matcher", "composer-trigger-utils", "composer-trigger-types",
].map(name => `internal/${name}.d.ts`));

export function isPublicPluginDeclaration(relativePath, publicPresentations) {
  const logicalPath = relativePath.replaceAll("\\", "/");
  return logicalPath.startsWith("catalog/") || logicalPath.startsWith("plugin-api/") || logicalPath === "composer-data/input-controller.d.ts" ||
    publicPresentations.has(logicalPath) || sourceRuntimeDeclarations.has(logicalPath) || [
      "internal/conversation-surface.d.ts", "search-files-example.d.ts", "index.d.ts", "contracts.d.ts", "locale.d.ts", "presentation.d.ts", "public.d.ts",
      "composer-triggers.d.ts", "lexical.d.ts", "generative-ui.d.ts", "demo-attachments.d.ts", "theme/theme-contract.d.ts",
    ].includes(logicalPath) || logicalPath.startsWith("locales/");
}
