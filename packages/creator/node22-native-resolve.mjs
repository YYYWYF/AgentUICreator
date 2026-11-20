// Vite 6's test module runner cannot resolve ESM imports itself. Keep this
// test-only bridge native and resolve tool dependencies from their Creator owner.
import { resolve } from "import-meta-resolve";
export const nativeResolve = specifier => resolve(specifier, import.meta.url);
