import type { Options } from "prettier";
export const projectCodeFormat: Readonly<Options>;
export function formatProjectCode(source: string): Promise<string>;
