// Vite 6's test module runner cannot resolve ESM imports itself. Keep this
// test-only bridge native and resolve tool dependencies from their Creator owner.
export const nativeResolve = specifier => import.meta.resolve(specifier);
