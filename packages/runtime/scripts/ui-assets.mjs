/** CSS references use forward slashes independently of native filesystem paths. */
export function cssAssetImport(relativePath) {
  return `@import "./${relativePath.replaceAll("\\", "/")}";`;
}
