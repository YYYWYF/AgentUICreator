/** Declaration names are logical paths, even when a caller uses Windows paths. */
export function isPublicPluginDeclaration(relativePath, publicPresentations) {
  const logicalPath = relativePath.replaceAll("\\", "/");
  return logicalPath.startsWith("catalog/") || logicalPath.startsWith("plugin-api/") ||
    publicPresentations.has(logicalPath) || [
      "internal/conversation-surface.d.ts", "search-files-example.d.ts", "index.d.ts", "contracts.d.ts", "locale.d.ts", "form-tools.d.ts", "public.d.ts",
      "lexical.d.ts", "generative-ui.d.ts", "demo-attachments.d.ts", "theme/theme-contract.d.ts",
    ].includes(logicalPath) || logicalPath.startsWith("locales/");
}
