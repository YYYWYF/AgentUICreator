export const SEARCH_LABELS_SEAM_ID: string;
export const SEARCH_LABELS_SEAM_FILES: readonly string[];
export function applySearchPresentationLabels(source: string, localPath: string): string;
export function applyProductAdaptations(source: string, localPath: string): string;
export interface ProductAdapterFile {
  localPath: string;
  upstreamInstalledSha256: string;
  installedSha256: string;
  source: string;
}
export function prepareProductAdapters(vendorDirectory?: string): Promise<{
  revision: string;
  files: ProductAdapterFile[];
}>;
export function syncProductAdapters(vendorDirectory?: string): Promise<void>;
export function checkProductAdapters(vendorDirectory?: string): Promise<void>;
