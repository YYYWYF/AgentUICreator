/** Replaced at build time by Vite, Webpack/CRA and Rsbuild; no Node polyfill. */
declare const process: { env: { NODE_ENV?: string } };
export const development = process.env.NODE_ENV === 'development';
