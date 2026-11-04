import { type CreatorDockIntegrationOptions } from "./integration.js";
/** For webpack-dev-server's Node API, pass this result as the server options. */
export declare function createCreatorDockWebpackDevServerOptions<T extends object>(devServer: T, options?: CreatorDockIntegrationOptions): Omit<T, "proxy"> & {
    proxy: Array<Record<string, unknown>>;
};
/** Uses the host compiler's API and sources; no second Webpack is installed. */
export declare function createCreatorDockWebpackPlugin(options?: CreatorDockIntegrationOptions): {
    apply(compiler: unknown): void;
};
//# sourceMappingURL=webpack.d.ts.map